/**
 * 内容抓取与解析工具
 * 支持 URL 抓取、PDF 解析、纯文本
 */

import OpenAI from 'openai'

export type InputType = 'text' | 'url' | 'pdf'

export interface ParsedContent {
  content: string
  source: string
  title?: string
}

/**
 * 从 URL 抓取文本内容
 * 支持 arXiv abstract 页面和普通网页
 */
export async function fetchFromUrl(url: string): Promise<ParsedContent> {
  const trimmedUrl = url.trim()

  // arXiv abstract 页面特殊处理
  const arxivMatch = trimmedUrl.match(/arxiv\.org\/abs\/(\d+\.\d+)/)
  if (arxivMatch) {
    const arxivId = arxivMatch[1]
    // 用 arXiv API 获取摘要
    const apiUrl = `http://export.arxiv.org/api/query?id_list=${arxivId}`
    const response = await fetch(apiUrl)
    const xml = await response.text()

    // 提取标题和摘要
    const titleMatch = xml.match(/<title>([^<]+)<\/title>/g)
    const summaryMatch = xml.match(/<summary>([^<]+)<\/summary>/)

    const title = titleMatch && titleMatch[1]
      ? titleMatch[1].replace(/<[^>]+>/g, '').trim()
      : undefined
    const summary = summaryMatch && summaryMatch[1]
      ? summaryMatch[1].replace(/<[^>]+>/g, '').trim()
      : ''

    return {
      content: summary,
      source: trimmedUrl,
      title,
    }
  }

  // 普通网页：抓取 HTML 并提取正文
  const response = await fetch(trimmedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ResearchKit/1.0)',
    },
  })

  if (!response.ok) {
    throw new Error(`抓取失败：HTTP ${response.status}`)
  }

  const html = await response.text()

  // 简单的 HTML → 文本转换
  // 移除 script 和 style 标签
  const cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    // 提取 title
    .replace(/<title[^>]*>([^<]+)<\/title>/i, (match, title) => {
      return `___TITLE___${title}___END___`
    })

  // 提取 title
  const titleMatch = cleaned.match(/___TITLE___([^<]+)___END___/)
  const title = titleMatch ? titleMatch[1].trim() : undefined

  // 去除所有标签
  const text = cleaned
    .replace(/___TITLE___[^<]+___END___/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

  // 截取前 30000 字符（避免超长）
  const truncated = text.length > 30000 ? text.substring(0, 30000) + '...' : text

  return {
    content: truncated,
    source: trimmedUrl,
    title,
  }
}

/**
 * 从 PDF 文件提取文本
 * 使用 LLM 的 vision 能力或纯文本提取
 */
export async function parsePdf(file: File): Promise<ParsedContent> {
  // 将 PDF 文件转为 base64
  const arrayBuffer = await file.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')

  // 使用 DeepSeek 的文档理解能力（如果支持）
  // 这里我们用一个简单的方案：先尝试用 pdf-parse 库
  // 但为了避免额外依赖，我们直接用 LLM 处理文本
  // 如果 PDF 是扫描件（图片），需要 vision 模型

  // 简单方案：把 PDF 当作二进制 base64，让 LLM 尝试提取
  // 但 DeepSeek 不支持 PDF 输入，所以我们用文本方式
  // 这里需要动态导入 pdf-parse

  try {
    // 动态导入避免构建时依赖
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParseModule: any = await import('pdf-parse')
    const pdfParse = pdfParseModule.default || pdfParseModule
    const buffer = Buffer.from(arrayBuffer)
    const data = await pdfParse(buffer)
    return {
      content: data.text,
      source: file.name,
      title: data.info?.Title,
    }
  } catch (error) {
    // 如果 pdf-parse 不可用或解析失败
    throw new Error(`PDF 解析失败：${error instanceof Error ? error.message : '未知错误'}。请尝试复制粘贴文本。`)
  }
}

/**
 * 主入口：根据输入类型解析内容
 */
export async function parseContent(
  input: string,
  inputType: InputType,
  file?: File
): Promise<ParsedContent> {
  switch (inputType) {
    case 'url':
      return await fetchFromUrl(input)
    case 'pdf':
      if (!file) throw new Error('PDF 模式需要上传文件')
      return await parsePdf(file)
    case 'text':
    default:
      return {
        content: input,
        source: '用户输入',
      }
  }
}

/**
 * 把知识卡导出为 Markdown
 */
export function exportToMarkdown(
  card: {
    title: string
    core_arguments: string[]
    key_terms: Array<{ term: string; definition: string }>
    methodology: string
    actionable_takeaways: string[]
    references: string[]
  },
  source?: string
): string {
  let md = `# ${card.title}\n\n`

  if (source) {
    md += `> 来源：${source}\n\n`
  }

  md += `## 💡 核心观点\n\n`
  card.core_arguments.forEach((arg, i) => {
    md += `${i + 1}. ${arg}\n`
  })
  md += `\n`

  md += `## 🔤 关键术语\n\n`
  card.key_terms.forEach(item => {
    md += `- **${item.term}**：${item.definition}\n`
  })
  md += `\n`

  md += `## 🔧 方法论\n\n`
  md += `${card.methodology}\n\n`

  md += `## ✅ 可操作建议\n\n`
  card.actionable_takeaways.forEach((item, i) => {
    md += `${i + 1}. ${item}\n`
  })
  md += `\n`

  if (card.references && card.references.length > 0) {
    md += `## 📚 参考文献\n\n`
    card.references.forEach(ref => {
      md += `- ${ref}\n`
    })
  }

  md += `\n---\n*Generated by ResearchKit — 一站式 AI Research Agent*\n`
  return md
}

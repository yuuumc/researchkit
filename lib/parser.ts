/**
 * 内容抓取与解析工具
 * 支持 URL 抓取、PDF 解析、纯文本
 *
 * 升级版：exportToMarkdown / exportToObsidian 适配新 KnowledgeCard schema
 * （research_goals / innovation / experiments / results / limitations / future_work / applications / datasets 等）
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
    // 用 arXiv API 获取摘要 — 必须 HTTPS（http 会被强制重定向，Node fetch 默认不跟随跨协议）
    const apiUrl = `https://export.arxiv.org/api/query?id_list=${arxivId}`

    // arXiv API 限流严格，批量并发常触发 429 → fetch failed
    // 加重试退避：最多 3 次，间隔 1s / 2s / 4s
    let lastErr: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(apiUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ResearchKit/1.0)' },
        })
        if (response.status === 429) {
          // 限流：按退避等待后重试
          const waitMs = 1000 * Math.pow(2, attempt) // 1s, 2s, 4s
          await new Promise(r => setTimeout(r, waitMs))
          continue
        }
        if (!response.ok) {
          throw new Error(`arXiv API HTTP ${response.status}`)
        }
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
      } catch (err) {
        lastErr = err
        // 网络错误也重试（间隔 1s, 2s）
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
        }
      }
    }
    throw new Error(`arXiv 抓取失败（重试 3 次仍失败）：${lastErr instanceof Error ? lastErr.message : '未知错误'}`)
  }

  // 普通网页：抓取 HTML 并提取正文
  // SSRF 防护：校验协议 + 拒绝内网/保留 IP（防止读取云元数据 169.254.169.254 等）
  const parsedUrl = new URL(trimmedUrl)
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error(`不支持的协议：${parsedUrl.protocol}（仅允许 http/https）`)
  }
  const hostname = parsedUrl.hostname.toLowerCase()
  const isPrivateHost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^169\.254\./.test(hostname) ||  // 链路本地（云元数据）
    /^fc00:|^fd/.test(hostname) ||   // IPv6 unique local
    /^fe80:/.test(hostname)          // IPv6 link-local
  if (isPrivateHost) {
    throw new Error(`拒绝抓取内网地址：${hostname}（防止 SSRF）`)
  }

  const response = await fetch(trimmedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ResearchKit/1.0)',
    },
    redirect: 'error',  // 拒绝重定向，避免绕过 SSRF 校验
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
 */
export async function parsePdf(file: File): Promise<ParsedContent> {
  const arrayBuffer = await file.arrayBuffer()

  try {
    // pdf-parse v2.x API：导出 PDFParse 类，需 new + options.data
    // 配合 next.config.js 的 experimental.serverComponentsExternalPackages
    // 让 Node 直接 require，避免 webpack 打包导致的 Object.defineProperty 错误
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParseModule: any = await import('pdf-parse')
    const PDFParse = pdfParseModule.PDFParse || pdfParseModule.default?.PDFParse
    if (!PDFParse) {
      throw new Error('pdf-parse 模块未导出 PDFParse 类（请检查版本兼容性）')
    }
    const buffer = Buffer.from(arrayBuffer)
    const pdf = new PDFParse({ data: buffer })
    const data = await pdf.getText()
    // v2.x 返回 { text, pages, total }；info 需要单独调用 getInfo 获取
    let info: any
    try {
      info = await pdf.getInfo()
    } catch {
      // getInfo 在某些 PDF 上可能失败，但不影响文本提取
    }
    return {
      content: data.text || '',
      source: file.name,
      title: info?.info?.Title,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    // 更友好的错误提示
    if (msg.includes('Object.defineProperty')) {
      throw new Error('PDF 解析模块加载失败（webpack 配置问题，请重启 dev server 让 next.config.js 生效）')
    }
    throw new Error(`PDF 解析失败：${msg}。请尝试复制粘贴文本。`)
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

// =========================================================
// 导出函数 — 适配新 KnowledgeCard schema
// =========================================================

/**
 * 知识卡的统一输入类型（兼容新旧 schema）
 * - 新 schema: research_goals / innovation / experiments / results / limitations / future_work / applications / datasets
 * - 旧 schema: core_arguments / actionable_takeaways（向后兼容）
 */
export interface KnowledgeCardLike {
  title: string
  authors?: string[]
  field?: string
  difficulty?: 'Beginner' | 'Intermediate' | 'Advanced' | string
  year?: number
  language?: 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es' | 'other'  // 升级版新增
  locale?: string                          // 升级版新增：完整 locale 字符串（zh-CN / en-US / ja-JP 等）

  summary?: string
  research_goals?: string[]
  innovation?: string[]
  methodology?: string
  experiments?: string[]
  results?: string[]
  limitations?: string[]
  future_work?: string[]

  // 升级版新增：Reader 价值导向字段
  takeaway?: string
  why_it_matters?: string
  what_surprised?: string
  who_should_read?: string[]

  key_terms?: Array<{
    term: string
    definition: string
    category?: string
    importance?: number
    prerequisite?: string[]
  }>

  applications?: string[]
  datasets?: string[]
  citations?: string[]
  references?: string[]
  tags?: string[]

  // 升级版新增：评分
  evaluation?: {
    completeness: number
    confidence: number
    evidence: 'Strong' | 'Medium' | 'Weak'
    filled_fields?: string[]
    missing_fields?: string[]
  }

  // 旧字段（向后兼容）
  core_arguments?: string[]
  actionable_takeaways?: string[]

  reading_time_min?: number
  structure?: string
}

/**
 * 按语言切换 Markdown 标签 — 中英双语
 * 升级版：避免英文论文输出中文标签的尴尬
 *
 * 升级版（locale 感知）：
 * - zh-CN → 中文标签
 * - 其他 locale → 英文标签（统一 fallback）
 * - 兼容旧的 language 字段（'zh' 仍走中文路径）
 */
function getLabels(language?: string, locale?: string) {
  const isZh = language === 'zh' || locale === 'zh-CN'
  return {
    authors: isZh ? '作者' : 'Authors',
    field: isZh ? '领域' : 'Field',
    year: isZh ? '年份' : 'Year',
    difficulty: isZh ? '难度' : 'Difficulty',
    readingTime: isZh ? '阅读时长' : 'Reading time',
    source: isZh ? '来源' : 'Source',
    quality: isZh ? '质量评分' : 'Quality',
    completeness: isZh ? '完整度' : 'Completeness',
    confidence: isZh ? '置信度' : 'Confidence',
    evidence: isZh ? '证据强度' : 'Evidence',
    takeaway: isZh ? '核心结论' : 'Takeaway',
    whyItMatters: isZh ? '为什么重要' : 'Why It Matters',
    whatSurprised: isZh ? '最令人意外' : 'What Surprised Me',
    whoShouldRead: isZh ? '谁应该读' : 'Who Should Read',
    summary: isZh ? '一句话摘要' : 'Summary',
    researchGoals: isZh ? '研究目的' : 'Research Goals',
    innovation: isZh ? '创新点 / 主要贡献' : 'Innovation / Key Contributions',
    methodology: isZh ? '方法论' : 'Methodology',
    experiments: isZh ? '实验设置' : 'Experiments',
    results: isZh ? '主要结果' : 'Results',
    keyTerms: isZh ? '关键术语' : 'Key Terms',
    applications: isZh ? '应用场景' : 'Applications',
    datasets: isZh ? '数据集' : 'Datasets',
    limitations: isZh ? '局限性' : 'Limitations',
    futureWork: isZh ? '未来工作' : 'Future Work',
    references: isZh ? '推荐阅读' : 'Recommended Reading',
    structure: isZh ? '文章结构' : 'Structure',
    // Obsidian callout 标题（升级版新增）
    metadataCallout: isZh ? '元数据' : 'Metadata',
    sourceCallout: isZh ? '来源' : 'Source',
    tagsLabel: isZh ? '标签' : 'Tags',
    generatedBy: isZh ? '由 ResearchKit OS 生成 — AI 研究操作系统' : 'Generated by ResearchKit OS — AI Research Operating System',
    obsidianNote: isZh ? '双链格式：术语已用 `[[term]]` 包裹，导入 Obsidian 后可形成知识图谱。' : 'Bidirectional links: terms are wrapped with `[[term]]` to form a knowledge graph after importing to Obsidian.',
  }
}

/**
 * 安全的 term 链接化函数 — 同一行只链第一次出现
 */
function makeLinkifyOncePerLine(termMap: Map<string, string>) {
  return (text: string): string => {
    if (!text) return text
    return text.split('\n').map(line => {
      const linked = new Set<string>()
      termMap.forEach(original => {
        const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const regex = new RegExp(`(?<!\\[\\[)${escaped}(?!\\]\\])`, 'g')
        line = line.replace(regex, (match) => {
          if (linked.has(match.toLowerCase())) {
            return match
          }
          linked.add(match.toLowerCase())
          return `[[${original}]]`
        })
      })
      return line
    }).join('\n')
  }
}

/**
 * 构建术语映射表（用于 Obsidian 双链）
 */
function buildTermMap(keyTerms: KnowledgeCardLike['key_terms'] = []): Map<string, string> {
  const map = new Map<string, string>()
  keyTerms.forEach(item => {
    const normalized = item.term.trim()
    if (normalized.length >= 2) {
      map.set(normalized.toLowerCase(), normalized)
    }
  })
  return map
}

/**
 * 把知识卡导出为 Markdown — 完整新 schema
 *
 * 升级版：
 * - 加 YAML frontmatter（与 Obsidian 一致，便于其他 Markdown 工具读取元数据）
 * - 渲染 Reader 新字段（takeaway / why_it_matters / what_surprised / who_should_read）
 * - 渲染 evaluation 评分（Completeness / Confidence / Evidence）
 * - 渲染术语的 importance + prerequisite
 * - 按语言切换标签（中文论文用中文标签，英文论文用英文标签）
 */
export function exportToMarkdown(card: KnowledgeCardLike, source?: string): string {
  // 获取语言对应的标签
  const labels = getLabels(card.language, card.locale)
  const isZh = card.language === 'zh' || card.locale === 'zh-CN'

  // ===== YAML frontmatter（升级版新增） =====
  const tags = ['researchkit', 'knowledge-card', ...(card.tags || [])]
  if (card.field) tags.push(String(card.field).toLowerCase().replace(/\s+/g, '-'))
  if (card.difficulty) tags.push(String(card.difficulty).toLowerCase())
  if (card.language) tags.push(`lang-${card.language}`)
  if (card.locale) tags.push(`locale-${card.locale}`)

  let md = `---\n`
  md += `title: "${card.title.replace(/"/g, '\\"')}"\n`
  if (card.authors && card.authors.length > 0) {
    md += `authors:\n`
    card.authors.forEach(a => { md += `  - "${a.replace(/"/g, '\\"')}"\n` })
  }
  if (card.field) md += `field: "${card.field}"\n`
  if (card.year) md += `year: ${card.year}\n`
  if (card.difficulty) md += `difficulty: "${card.difficulty}"\n`
  if (card.reading_time_min) md += `reading_time_min: ${card.reading_time_min}\n`
  if (card.language) md += `language: "${card.language}"\n`
  if (card.locale) md += `locale: "${card.locale}"\n`
  md += `type: knowledge-card\n`
  md += `tags:\n`
  tags.forEach(t => { md += `  - ${t}\n` })
  if (source) md += `source: "${source}"\n`
  if (card.evaluation) {
    md += `completeness: ${card.evaluation.completeness}\n`
    md += `confidence: ${card.evaluation.confidence}\n`
    md += `evidence: "${card.evaluation.evidence}"\n`
  }
  md += `generated: ${new Date().toISOString()}\n`
  md += `---\n\n`

  md += `# ${card.title}\n\n`

  // ===== 评分卡（升级版新增，置于顶部给用户质量信号） =====
  if (card.evaluation) {
    md += `> [!quality] ${labels.quality}\n`
    md += `> **${labels.completeness}** ${card.evaluation.completeness}% · **${labels.confidence}** ${card.evaluation.confidence}% · **${labels.evidence}** ${card.evaluation.evidence}\n\n`
  }

  // 元数据行
  const metaParts: string[] = []
  if (card.authors && card.authors.length > 0) {
    metaParts.push(`**${labels.authors}**: ${card.authors.join(', ')}`)
  }
  if (card.field) {
    metaParts.push(`**${labels.field}**: ${card.field}`)
  }
  if (card.year) {
    metaParts.push(`**${labels.year}**: ${card.year}`)
  }
  if (card.difficulty) {
    metaParts.push(`**${labels.difficulty}**: ${card.difficulty}`)
  }
  if (card.reading_time_min) {
    metaParts.push(`**${labels.readingTime}**: ${card.reading_time_min} min`)
  }
  if (metaParts.length > 0) {
    md += metaParts.join(' · ') + '\n\n'
  }

  if (source) {
    md += `> ${labels.source}：${source}\n\n`
  }

  // ===== Reader 价值导向字段（升级版新增，置于摘要前） =====
  if (card.takeaway) {
    md += `## 🎯 ${labels.takeaway}\n\n${card.takeaway}\n\n`
  }
  if (card.why_it_matters) {
    md += `## 💭 ${labels.whyItMatters}\n\n${card.why_it_matters}\n\n`
  }
  if (card.what_surprised) {
    md += `## ✨ ${labels.whatSurprised}\n\n${card.what_surprised}\n\n`
  }
  if (card.who_should_read && card.who_should_read.length > 0) {
    md += `## 👥 ${labels.whoShouldRead}\n\n`
    card.who_should_read.forEach(r => { md += `- ${r}\n` })
    md += `\n`
  }

  if (card.summary) {
    md += `## 📌 ${labels.summary}\n\n${card.summary}\n\n`
  }

  // 研究目的
  const researchGoals = card.research_goals || []
  if (researchGoals.length > 0) {
    md += `## 🎯 ${labels.researchGoals}\n\n`
    researchGoals.forEach((g, i) => { md += `${i + 1}. ${g}\n` })
    md += `\n`
  }

  // 创新点
  const innovation = card.innovation || card.core_arguments || []
  if (innovation.length > 0) {
    md += `## 💡 ${labels.innovation}\n\n`
    innovation.forEach((arg, i) => { md += `${i + 1}. ${arg}\n` })
    md += `\n`
  }

  // 方法论
  if (card.methodology) {
    md += `## 🔧 ${labels.methodology}\n\n${card.methodology}\n\n`
  }

  // 实验
  if (card.experiments && card.experiments.length > 0) {
    md += `## 🧪 ${labels.experiments}\n\n`
    card.experiments.forEach((e, i) => { md += `${i + 1}. ${e}\n` })
    md += `\n`
  }

  // 结果
  if (card.results && card.results.length > 0) {
    md += `## 📊 ${labels.results}\n\n`
    card.results.forEach((r, i) => { md += `${i + 1}. ${r}\n` })
    md += `\n`
  }

  // 关键术语（升级版：显示 importance 星级 + prerequisite 链）
  if (card.key_terms && card.key_terms.length > 0) {
    md += `## 🔤 ${labels.keyTerms}\n\n`
    card.key_terms.forEach(item => {
      const cat = item.category ? ` *(${item.category})*` : ''
      const stars = item.importance ? ` ${'★'.repeat(item.importance)}${'☆'.repeat(5 - item.importance)}` : ''
      const prereq = item.prerequisite && item.prerequisite.length > 0 ? ` _← ${item.prerequisite.join(', ')}_` : ''
      md += `- **${item.term}**${cat}${stars}${prereq}：${item.definition}\n`
    })
    md += `\n`
  }

  // 应用场景
  const applications = card.applications || card.actionable_takeaways || []
  if (applications.length > 0) {
    md += `## 🚀 ${labels.applications}\n\n`
    applications.forEach((a, i) => { md += `${i + 1}. ${a}\n` })
    md += `\n`
  }

  // 数据集
  if (card.datasets && card.datasets.length > 0) {
    md += `## 📁 ${labels.datasets}\n\n`
    card.datasets.forEach(d => { md += `- ${d}\n` })
    md += `\n`
  }

  // 局限性
  if (card.limitations && card.limitations.length > 0) {
    md += `## ⚠️ ${labels.limitations}\n\n`
    card.limitations.forEach((l, i) => { md += `${i + 1}. ${l}\n` })
    md += `\n`
  }

  // 未来工作
  if (card.future_work && card.future_work.length > 0) {
    md += `## 🔮 ${labels.futureWork}\n\n`
    card.future_work.forEach((f, i) => { md += `${i + 1}. ${f}\n` })
    md += `\n`
  }

  // 参考文献（包含推荐阅读）
  const refs = card.references || []
  if (refs.length > 0) {
    md += `## 📚 ${labels.references}\n\n`
    refs.forEach(ref => { md += `- ${ref}\n` })
    md += `\n`
  }

  // 标签
  if (card.tags && card.tags.length > 0) {
    md += `**${labels.tagsLabel}**: ${card.tags.map(t => `#${t}`).join(' ')}\n\n`
  }

  md += `---\n*${labels.generatedBy}*\n`
  return md
}

/**
 * 把知识卡导出为 Mermaid Mindmap 语法
 *
 * 用法：直接复制到 Obsidian / Notion / GitHub / mermaid.live 渲染
 *
 * 语法：
 *   mindmap
 *     root(("Title"))
 *       "Branch"
 *         "Leaf"
 *
 * 注意：
 * - 所有节点统一用双引号包裹（最安全，避免 emoji / 括号 / 编号等字符触发 parser 错误）
 * - 不能在节点前加 "1. " 编号前缀（会被当作 NODE_ID 但后面跟引号字符串不合法）
 * - 用 indent 表示层级（2 空格 / level）
 */
export function exportToMindmap(card: KnowledgeCardLike): string {
  // 统一 escape：所有节点都用双引号包裹 + 移除 mermaid 保留字符
  // mermaid mindmap parser 即使在引号内也会被 () [] {} | : # 等字符误导
  // （会误识为 id(text) / id[text] / id{text} 等形状语法），必须移除
  const escape = (s: string) => {
    if (!s) return '""'
    // 截短到 60 字符
    const truncated = s.length > 60 ? s.substring(0, 57) + '...' : s
    const cleaned = truncated
      .replace(/"/g, "'")              // 双引号 → 单引号（避免破坏字符串边界）
      .replace(/\n/g, ' ')             // 换行 → 空格
      .replace(/[()[\]{}|:#]/g, ' ')   // mermaid 保留字符 → 空格
      .replace(/\s+/g, ' ')            // 合并多个空格
      .trim()
    return `"${cleaned || ' '}"`
  }

  let md = `mindmap\n`
  md += `  root((${escape(card.title || 'Untitled')}))\n`

  // 摘要
  if (card.summary) {
    md += `    ${escape("📌 Summary")}\n`
    md += `      ${escape(card.summary)}\n`
  }

  // 作者
  if (card.authors && card.authors.length > 0) {
    md += `    ${escape("👥 Authors")}\n`
    card.authors.slice(0, 5).forEach(a => {
      md += `      ${escape(a)}\n`
    })
  }

  // 元数据：领域/年份/难度
  const metaBits: string[] = []
  if (card.field) metaBits.push(`Field: ${card.field}`)
  if (card.year) metaBits.push(`Year: ${card.year}`)
  if (card.difficulty) metaBits.push(`Level: ${card.difficulty}`)
  if (metaBits.length > 0) {
    md += `    ${escape("🏷️ Meta")}\n`
    metaBits.forEach(m => { md += `      ${escape(m)}\n` })
  }

  // 研究目的
  if (card.research_goals && card.research_goals.length > 0) {
    md += `    ${escape("🎯 Research Goals")}\n`
    card.research_goals.slice(0, 5).forEach((g) => {
      md += `      ${escape(g)}\n`
    })
  }

  // 创新点
  const innovation = card.innovation || card.core_arguments || []
  if (innovation.length > 0) {
    md += `    ${escape("💡 Innovation")}\n`
    innovation.slice(0, 5).forEach((arg) => {
      md += `      ${escape(arg)}\n`
    })
  }

  // 方法论
  if (card.methodology) {
    md += `    ${escape("🔧 Methodology")}\n`
    md += `      ${escape(card.methodology)}\n`
  }

  // 实验
  if (card.experiments && card.experiments.length > 0) {
    md += `    ${escape("🧪 Experiments")}\n`
    card.experiments.slice(0, 5).forEach((e) => {
      md += `      ${escape(e)}\n`
    })
  }

  // 结果
  if (card.results && card.results.length > 0) {
    md += `    ${escape("📊 Results")}\n`
    card.results.slice(0, 5).forEach((r) => {
      md += `      ${escape(r)}\n`
    })
  }

  // 关键术语
  if (card.key_terms && card.key_terms.length > 0) {
    md += `    ${escape("🔤 Key Terms")}\n`
    card.key_terms.slice(0, 8).forEach(t => {
      md += `      ${escape(t.term)}\n`
    })
  }

  // 应用
  const applications = card.applications || card.actionable_takeaways || []
  if (applications.length > 0) {
    md += `    ${escape("🚀 Applications")}\n`
    applications.slice(0, 5).forEach((a) => {
      md += `      ${escape(a)}\n`
    })
  }

  // 局限性
  if (card.limitations && card.limitations.length > 0) {
    md += `    ${escape("⚠️ Limitations")}\n`
    card.limitations.slice(0, 5).forEach((l) => {
      md += `      ${escape(l)}\n`
    })
  }

  // 未来工作
  if (card.future_work && card.future_work.length > 0) {
    md += `    ${escape("🔮 Future Work")}\n`
    card.future_work.slice(0, 3).forEach((f) => {
      md += `      ${escape(f)}\n`
    })
  }

  return md
}

/**
 * 把知识卡导出为 Obsidian 双链格式
 * - 关键术语用 [[term]] 包裹形成双链
 * - 自动生成 frontmatter (YAML) 带 tags / field / difficulty / authors
 * - 核心字段中出现的术语自动双链（每行只链第一次）
 */
export function exportToObsidian(card: KnowledgeCardLike, source?: string): string {
  const termMap = buildTermMap(card.key_terms)
  const linkifyOncePerLine = makeLinkifyOncePerLine(termMap)
  const labels = getLabels(card.language, card.locale)
  const isZh = card.language === 'zh' || card.locale === 'zh-CN'

  // 生成 YAML frontmatter
  const tags = ['researchkit', 'knowledge-card', ...(card.tags || [])]
  if (card.field) tags.push(card.field.toLowerCase().replace(/\s+/g, '-'))
  if (card.difficulty) tags.push(String(card.difficulty).toLowerCase())
  if (card.language) tags.push(`lang-${card.language}`)
  if (card.locale) tags.push(`locale-${card.locale}`)
  if (source) tags.push('imported')

  let md = `---\n`
  md += `title: "${card.title.replace(/"/g, '\\"')}"\n`
  if (card.authors && card.authors.length > 0) {
    md += `authors:\n`
    card.authors.forEach(a => { md += `  - "${a.replace(/"/g, '\\"')}"\n` })
  }
  if (card.field) md += `field: "${card.field}"\n`
  if (card.year) md += `year: ${card.year}\n`
  if (card.difficulty) md += `difficulty: "${card.difficulty}"\n`
  if (card.language) md += `language: "${card.language}"\n`
  if (card.locale) md += `locale: "${card.locale}"\n`
  md += `type: knowledge-card\n`
  md += `tags:\n`
  tags.forEach(t => { md += `  - ${t}\n` })
  if (source) md += `source: "${source}"\n`
  md += `generated: ${new Date().toISOString()}\n`
  md += `---\n\n`

  md += `# ${card.title}\n\n`

  // 元数据 callout
  const metaParts: string[] = []
  if (card.authors && card.authors.length > 0) {
    metaParts.push(`**${labels.authors}**: ${card.authors.join(', ')}`)
  }
  if (card.field) metaParts.push(`**${labels.field}**: ${card.field}`)
  if (card.year) metaParts.push(`**${labels.year}**: ${card.year}`)
  if (card.difficulty) metaParts.push(`**${labels.difficulty}**: ${card.difficulty}`)
  if (card.reading_time_min) metaParts.push(`**${labels.readingTime}**: ${card.reading_time_min} min`)
  if (metaParts.length > 0) {
    md += `> [!info] ${labels.metadataCallout}\n> ${metaParts.join(' · ')}\n\n`
  }

  if (source) {
    md += `> [!info] ${labels.sourceCallout}\n> ${source}\n\n`
  }

  // 评分卡（升级版新增）
  if (card.evaluation) {
    md += `> [!quality] ${labels.quality}\n`
    md += `> **${labels.completeness}** ${card.evaluation.completeness}% · **${labels.confidence}** ${card.evaluation.confidence}% · **${labels.evidence}** ${card.evaluation.evidence}\n\n`
  }

  // Reader 价值导向字段（与 exportToMarkdown 一致）
  if (card.takeaway) {
    md += `## 🎯 ${labels.takeaway}\n\n${linkifyOncePerLine(card.takeaway)}\n\n`
  }
  if (card.why_it_matters) {
    md += `## 💭 ${labels.whyItMatters}\n\n${linkifyOncePerLine(card.why_it_matters)}\n\n`
  }
  if (card.what_surprised) {
    md += `## ✨ ${labels.whatSurprised}\n\n${linkifyOncePerLine(card.what_surprised)}\n\n`
  }
  if (card.who_should_read && card.who_should_read.length > 0) {
    md += `## 👥 ${labels.whoShouldRead}\n\n`
    card.who_should_read.forEach(r => { md += `- ${r}\n` })
    md += `\n`
  }

  if (card.summary) {
    md += `## 📌 ${labels.summary}\n\n${linkifyOncePerLine(card.summary)}\n\n`
  }

  // 研究目的
  const researchGoals = card.research_goals || []
  if (researchGoals.length > 0) {
    md += `## 🎯 ${labels.researchGoals}\n\n`
    researchGoals.forEach((g, i) => {
      md += `${i + 1}. ${linkifyOncePerLine(g)}\n`
    })
    md += `\n`
  }

  // 创新点
  const innovation = card.innovation || card.core_arguments || []
  if (innovation.length > 0) {
    md += `## 💡 ${labels.innovation}\n\n`
    innovation.forEach((arg, i) => {
      md += `${i + 1}. ${linkifyOncePerLine(arg)}\n`
    })
    md += `\n`
  }

  // 方法论
  if (card.methodology) {
    md += `## 🔧 ${labels.methodology}\n\n${linkifyOncePerLine(card.methodology)}\n\n`
  }

  // 实验
  if (card.experiments && card.experiments.length > 0) {
    md += `## 🧪 ${labels.experiments}\n\n`
    card.experiments.forEach((e, i) => {
      md += `${i + 1}. ${linkifyOncePerLine(e)}\n`
    })
    md += `\n`
  }

  // 结果
  if (card.results && card.results.length > 0) {
    md += `## 📊 ${labels.results}\n\n`
    card.results.forEach((r, i) => {
      md += `${i + 1}. ${linkifyOncePerLine(r)}\n`
    })
    md += `\n`
  }

  // 关键术语 — 每个术语独立成一个块，方便 Obsidian 反向链接
  if (card.key_terms && card.key_terms.length > 0) {
    md += `## 🔤 ${labels.keyTerms}\n\n`
    card.key_terms.forEach(item => {
      const cat = item.category ? ` *(${item.category})*` : ''
      const stars = item.importance ? ` ${'★'.repeat(item.importance)}${'☆'.repeat(5 - item.importance)}` : ''
      const prereq = item.prerequisite && item.prerequisite.length > 0 ? ` _← ${item.prerequisite.join(', ')}_` : ''
      md += `- **[[${item.term}]]**${cat}${stars}${prereq}：${item.definition}\n`
    })
    md += `\n`
  }

  // 应用场景
  const applications = card.applications || card.actionable_takeaways || []
  if (applications.length > 0) {
    md += `## 🚀 ${labels.applications}\n\n`
    applications.forEach((a, i) => {
      md += `${i + 1}. ${linkifyOncePerLine(a)}\n`
    })
    md += `\n`
  }

  // 数据集
  if (card.datasets && card.datasets.length > 0) {
    md += `## 📁 ${labels.datasets}\n\n`
    card.datasets.forEach(d => { md += `- ${d}\n` })
    md += `\n`
  }

  // 局限性
  if (card.limitations && card.limitations.length > 0) {
    md += `## ⚠️ ${labels.limitations}\n\n`
    card.limitations.forEach((l, i) => {
      md += `${i + 1}. ${linkifyOncePerLine(l)}\n`
    })
    md += `\n`
  }

  // 未来工作
  if (card.future_work && card.future_work.length > 0) {
    md += `## 🔮 ${labels.futureWork}\n\n`
    card.future_work.forEach((f, i) => {
      md += `${i + 1}. ${linkifyOncePerLine(f)}\n`
    })
    md += `\n`
  }

  // 参考文献
  const refs = card.references || []
  if (refs.length > 0) {
    md += `## 📚 ${labels.references}\n\n`
    refs.forEach(ref => { md += `- ${ref}\n` })
    md += `\n`
  }

  md += `---\n*${labels.generatedBy}*\n`
  md += `*${labels.obsidianNote}*\n`

  return md
}

/**
 * Reader Agent — 阅读理解输入内容，输出价值导向的阅读笔记
 *
 * 设计哲学（升级版）：
 * - 不再是"字段提取器"，而是"真正读完论文的人类读者"
 * - 程序能算的（readingTime / authors 正则）不用 LLM 浪费 token
 * - LLM 只做 LLM 才能做的：理解价值、判断意义、识别读者
 *
 * 输出：
 *   旧字段（向后兼容 KB）：summary / keyPassages / structure / authors
 *   新字段（价值导向）：takeaway / whyItMatters / whatSurprised / whoShouldRead / readingDifficulty
 *   readingTimeMin 由程序计算（content.length / 1000 字符 ≈ 250 词 ≈ 1 分钟）
 */

import OpenAI from 'openai'
import { Agent, AgentMessage, createMessage } from '@/lib/mcp'
import { detectLocale, localeToLanguage, localeDisplayName, Locale, buildLanguageDirective } from '@/lib/locale'
import { buildReaderPrompt } from '@/prompts/reader'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: (process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1').trim(),
})

const LLM_MODEL = process.env.LLM_MODEL?.trim() || 'deepseek-v4-flash'

export interface ReaderOutput {
  // ===== 旧字段（向后兼容 KnowledgeBuilder） =====
  summary: string           // 一句话摘要（保留以兼容 KB 兜底逻辑）
  keyPassages: string[]     // 关键段落（≤ 3 段）
  structure: string         // 文章结构
  readingTimeMin: number    // 阅读时长（程序计算，不让 LLM 估）
  authors: string[]         // 作者列表（升级版新增）

  // ===== 新字段 — 价值导向（Reader 真正的输出） =====
  takeaway: string                  // 一句话核心结论
  whyItMatters: string              // 为什么这篇论文重要
  whatSurprised: string             // 最令人意外/反直觉的发现
  whoShouldRead: string[]           // 谁应该读这篇论文（≤ 3 类人群）
  readingDifficulty: 'Beginner' | 'Intermediate' | 'Advanced'  // 阅读难度（人感判断）

  // ===== 升级版新增：检测到的输入语言 =====
  language: 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es' | 'other'  // ISO 639-1 简化（向后兼容）
  locale?: Locale                   // 升级版：完整 locale（zh-CN / en-US / ja-JP 等）
}

/**
 * 程序化计算阅读时长 — 不让 LLM 浪费 token
 * 中文按字符数 / 500，英文按词数 / 250
 */
function computeReadingTimeMin(content: string): number {
  const charCount = content.length
  // 简化：按字符数估算，中文 500 字符/分钟，英文约 1000 字符/分钟
  // 取折中 800 字符/分钟（实际混合内容）
  const minutes = Math.max(1, Math.ceil(charCount / 800))
  return minutes
}

/**
 * 程序化提取作者 — 从前 2000 字符中正则匹配
 * 匹配模式：By XXX, YYY / 作者：XXX / XXX, YYY (affiliation)
 */
function extractAuthorsByRegex(content: string): string[] {
  const header = content.substring(0, 2000)
  const authors: string[] = []

  // 模式 1：英文 "By John Smith, Jane Doe"
  const byMatch = header.match(/(?:^|\n)\s*By\s+([A-Z][a-zA-Z.\-]+(?:\s+[A-Z][a-zA-Z.\-]+)+(?:\s*,\s*[A-Z][a-zA-Z.\-]+(?:\s+[A-Z][a-zA-Z.\-]+)*)*)/)
  if (byMatch) {
    byMatch[1].split(',').forEach(name => {
      const trimmed = name.trim()
      if (trimmed && trimmed.length > 2 && trimmed.length < 60) authors.push(trimmed)
    })
  }

  // 模式 2：中文 "作者：张三、李四" / "Author(s): ..."
  const cnMatch = header.match(/(?:作者|Author(?:s)?)\s*[:：]\s*([^\n]{2,200})/)
  if (cnMatch) {
    cnMatch[1].split(/[、,，;；]/).forEach(name => {
      const trimmed = name.trim()
      if (trimmed && trimmed.length > 1 && trimmed.length < 40) authors.push(trimmed)
    })
  }

  return authors.slice(0, 10)  // 上限 10 位
}

export const ReaderAgent: Agent = {
  name: 'Reader',
  description: '阅读理解输入内容，输出价值导向的阅读笔记（takeaway / whyItMatters / whatSurprised / whoShouldRead / readingDifficulty）',
  capabilities: [
    {
      name: 'read',
      description: '以人类读者视角理解论文，输出价值判断',
      inputs: ['text'],
      outputs: ['takeaway', 'whyItMatters', 'whatSurprised', 'whoShouldRead', 'readingDifficulty', 'summary', 'keyPassages', 'structure', 'authors'],
    },
  ],

  async handleMessage(message: AgentMessage): Promise<AgentMessage> {
    if (message.type !== 'task') {
      return createMessage('error', 'Reader', message.from, { error: '只处理 task 类型消息' })
    }

    const { content, language_directive } = message.payload

    // ===== 程序化预处理（不让 LLM 浪费 token） =====
    const readingTimeMin = computeReadingTimeMin(content)
    const regexAuthors = extractAuthorsByRegex(content)

    // ===== Locale 检测（升级版：从 coordinator 传入或本地检测） =====
    // 优先用 coordinator 传入的 directive；否则本地检测
    const sourceLocale = message.payload.source_locale || detectLocale(content)
    const targetLocale = message.payload.target_locale || sourceLocale
    const finalLanguageDirective = language_directive || buildLanguageDirective(sourceLocale, targetLocale)

    const response = await openai.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        {
          role: 'system',
          content: buildReaderPrompt({ finalLanguageDirective }),
        },
        {
          role: 'user',
          content: content.substring(0, 30000),
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    })

    const raw = response.choices[0]?.message?.content || '{}'
    let parsed: any
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      console.error('[Reader] LLM 返回非 JSON:', raw.substring(0, 500))
      throw new Error('Reader LLM 返回非 JSON 格式（可能限流或返回错误文本）')
    }

    // ===== 校验关键字段 =====
    // 优先用新字段 takeaway，兼容用 summary
    const effectiveSummary = parsed.takeaway || parsed.summary
    if (!effectiveSummary || typeof effectiveSummary !== 'string' || effectiveSummary.trim() === '') {
      console.error('[Reader] LLM 未返回有效 takeaway/summary:', raw.substring(0, 500))
      throw new Error('Reader 未返回有效 takeaway（可能 LLM 限流或返回空响应）')
    }

    // ===== 合并 LLM 输出 + 程序化预处理 =====
    // 语言字段：以程序化检测结果为准（LLM 偶尔会误判）
    const finalLanguage = localeToLanguage(sourceLocale)

    const output: ReaderOutput = {
      // 旧字段
      summary: parsed.summary || effectiveSummary,        // KB 仍用这个
      keyPassages: parsed.keyPassages || [],
      structure: parsed.structure || '',
      readingTimeMin,                                       // 程序计算
      authors: regexAuthors,                                // 程序提取

      // 新字段
      takeaway: parsed.takeaway || effectiveSummary,
      whyItMatters: parsed.whyItMatters || '',
      whatSurprised: parsed.whatSurprised || '',
      whoShouldRead: parsed.whoShouldRead || [],
      readingDifficulty: parsed.readingDifficulty || 'Intermediate',

      // 语言字段：程序化检测的权威值
      language: finalLanguage,
      locale: sourceLocale,
    }

    return createMessage('result', 'Reader', message.from, output, message.id)
  },

  getCapabilities() {
    return this.capabilities
  },
}

/**
 * OpenAI/DeepSeek 兼容 LLM 调用封装
 *
 * v2.1 升级：内部改用 ProviderFactory（不动 generateKnowledgeCard 签名）
 * - 旧路径：const openai = new OpenAI(...) → openai.chat.completions.create(...)
 * - 新路径：const provider = ProviderFactory.fromEnv() → provider.chat(messages, options)
 *
 * 升级版：KnowledgeCard 接口与 multi-agent 输出对齐
 * 旧 endpoint (/api/research/knowledge-card) 现在也输出完整研究 schema
 */

import { KNOWLEDGE_CARD_SYSTEM_PROMPT, KNOWLEDGE_CARD_USER_PROMPT } from './prompts'
import { getServerProvider } from './server-provider'
import { PromptBuilder } from '@/core/prompt'
import { getServerProjectExtension } from './server-prompt-extensions'
import { getServerUserPreferences } from './server-user-preferences'

export interface KnowledgeCard {
  // 基础
  title: string
  authors: string[]
  field: string
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced'
  year?: number

  // 核心
  summary: string
  research_goals: string[]
  innovation: string[]
  methodology: string
  experiments: string[]
  results: string[]
  limitations: string[]
  future_work: string[]

  // 术语
  key_terms: Array<{
    term: string
    definition: string
    category?: string
  }>

  // 应用 & 关联
  applications: string[]
  datasets: string[]

  // 兼容旧字段（由 LLM 同时输出）
  core_arguments: string[]
  actionable_takeaways: string[]
  references: string[]

  // 元数据
  tags: string[]
}

export interface GenerateKnowledgeCardOptions {
  content: string
  language?: 'zh' | 'en'
  detailLevel?: 'brief' | 'standard' | 'detailed'
}

/**
 * 调用 LLM 生成结构化知识卡（完整研究 schema）
 */
export async function generateKnowledgeCard(
  options: GenerateKnowledgeCardOptions
): Promise<KnowledgeCard> {
  const { content, language = 'zh', detailLevel = 'standard' } = options

  // 根据 detail_level 调整 max_tokens
  const maxTokensMap = {
    brief: 1200,
    standard: 2500,
    detailed: 4000,
  }

  try {
    const provider = getServerProvider()
    const prefs = getServerUserPreferences()
    const kbBuilt = PromptBuilder.build({
      agent: 'KnowledgeBuilder',
      system: KNOWLEDGE_CARD_SYSTEM_PROMPT,
      project: getServerProjectExtension('KnowledgeBuilder'),
      preset: prefs.preset,
    })
    const response = await provider.chat(
      [
        { role: 'system', content: kbBuilt.content },
        { role: 'user', content: KNOWLEDGE_CARD_USER_PROMPT(content, language) },
      ],
      {
        maxTokens: maxTokensMap[detailLevel],
        temperature: 0.3, // 低温度保证输出稳定
        responseFormat: 'json_object',
      }
    )

    const rawContent = response.content
    if (!rawContent) {
      throw new Error('LLM 返回内容为空')
    }

    // 解析 JSON — 加截断容错（max_tokens 不够时 LLM 会输出不完整 JSON）
    let parsed: any
    try {
      parsed = JSON.parse(rawContent)
    } catch (parseErr) {
      // 截断兜底：尝试补全 JSON 末尾（最常见的截断场景：字符串/数组/对象中途被切）
      const trimmed = rawContent.trim()
      const lastQuote = trimmed.lastIndexOf('"')
      const lastBracket = Math.max(trimmed.lastIndexOf(']'), trimmed.lastIndexOf('}'))
      const lastComma = trimmed.lastIndexOf(',')

      // 策略：从最后一个完整的 key-value 之后截断，丢弃不完整的尾巴，补全括号
      let repaired = trimmed
      // 移除可能的不完整尾巴：最后一个引号后到末尾的内容
      if (lastQuote > lastBracket && lastQuote > lastComma) {
        // 找到最后一个 `"` 前的逗号或冒号位置
        const beforeQuote = trimmed.lastIndexOf(':', lastQuote)
        const commaBeforeQuote = trimmed.lastIndexOf(',', lastQuote)
        const cutPoint = Math.max(beforeQuote, commaBeforeQuote)
        if (cutPoint > 0) {
          // 如果是 key: "value 被截断 → 改成 key: "" 占位
          if (beforeQuote > commaBeforeQuote) {
            repaired = trimmed.substring(0, beforeQuote + 1) + ' ""'
          } else {
            repaired = trimmed.substring(0, cutPoint)
          }
        }
      }

      // 统计未闭合的 { 和 [
      const openBraces = (repaired.match(/\{/g) || []).length
      const closeBraces = (repaired.match(/\}/g) || []).length
      const openBrackets = (repaired.match(/\[/g) || []).length
      const closeBrackets = (repaired.match(/\]/g) || []).length
      const missingBraces = openBraces - closeBraces
      const missingBrackets = openBrackets - closeBrackets

      // 移除末尾可能残留的逗号
      repaired = repaired.replace(/,\s*$/, '')
      // 补全括号
      repaired = repaired + ']' .repeat(Math.max(0, missingBrackets))
      repaired = repaired + '}'.repeat(Math.max(0, missingBraces))

      try {
        parsed = JSON.parse(repaired)
        console.warn('[LLM] JSON 截断兜底成功，原始长度=' + rawContent.length + '，修复后长度=' + repaired.length)
      } catch (repairErr) {
        // 修复失败 → 重试一次，加大 max_tokens
        console.warn('[LLM] JSON 截断兜底失败，重试一次（max_tokens +1000）')
        const retryResponse = await provider.chat(
          [
            { role: 'system', content: kbBuilt.content },
            { role: 'user', content: KNOWLEDGE_CARD_USER_PROMPT(content, language) },
          ],
          {
            maxTokens: maxTokensMap[detailLevel] + 1000,
            temperature: 0.3,
            responseFormat: 'json_object',
          }
        )
        const retryContent = retryResponse.content
        if (!retryContent) throw new Error('LLM 重试返回空内容')
        try {
          parsed = JSON.parse(retryContent)
        } catch (finalErr) {
          throw new Error(`JSON 解析失败（重试后仍失败）: ${(finalErr as Error).message}`)
        }
      }
    }

    // 统一化为完整 schema（向后兼容缺字段）
    const knowledgeCard: KnowledgeCard = {
      title: parsed.title || 'Untitled',
      authors: parsed.authors || [],
      field: parsed.field || '',
      difficulty: parsed.difficulty || 'Intermediate',
      year: parsed.year || undefined,

      summary: parsed.summary || '',
      research_goals: parsed.research_goals || [],
      innovation: parsed.innovation || parsed.core_arguments || [],
      methodology: parsed.methodology || '',
      experiments: parsed.experiments || [],
      results: parsed.results || [],
      limitations: parsed.limitations || [],
      future_work: parsed.future_work || [],

      key_terms: (parsed.key_terms || []).map((t: any) => ({
        term: t.term || '',
        definition: t.definition || '',
        category: t.category,
      })),

      applications: parsed.applications || parsed.actionable_takeaways || [],
      datasets: parsed.datasets || [],

      core_arguments: parsed.core_arguments || parsed.innovation || [],
      actionable_takeaways: parsed.actionable_takeaways || parsed.applications || [],
      references: parsed.references || [],

      tags: ['researchkit', ...(parsed.tags || [])],
    }

    // 基础验证
    if (!knowledgeCard.title) {
      throw new Error('返回的知识卡格式不正确：缺少 title')
    }

    return knowledgeCard
  } catch (error) {
    console.error('LLM 调用失败:', error)
    throw new Error(`生成知识卡失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}

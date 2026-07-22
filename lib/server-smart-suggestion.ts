/**
 * D30 Smart Suggestion v2 — Server-side LLM 实现
 *
 * 用 LLM 判断当前 KC 与历史 KC 中最相关的一篇
 *
 * 设计：
 * - 输入：currentKC + history KC 列表（最多 5 篇摘要）
 * - 输出：SmartSuggestion（与 client-side v1 启发式接口一致）
 * - 失败时抛错，由调用方（API route 或 client）决定是否 fallback 到 v1
 */

import { getServerProvider } from './server-provider'
import { PromptBuilder } from '@/core/prompt'
import { getServerUserPreferences, getEffectiveOutputLocale } from './server-user-preferences'
import { getServerProjectExtension } from './server-prompt-extensions'
import { detectLocale, buildLanguageDirective } from './locale'
import { buildSmartSuggestionPrompt } from '@/prompts/smart-suggestion'
import { setCurrentAgent } from './usage-collector'
import type { KnowledgeCard } from '@/types/knowledge'
import type { KCHistoryEntry } from '@/lib/kc-history'

// 与 v1 保持类型一致（避免前端组件改动）
export interface SmartSuggestion {
  bestMatch: KCHistoryEntry | null
  score: number
  reasons: string[]
  relationType: 'same_field' | 'shared_authors' | 'shared_terms' | 'related' | 'none'
}

const MAX_HISTORY_IN_PROMPT = 5  // 避免 prompt 过长（5 篇约 1500 tokens）

interface LLMResponse {
  bestMatchId: string | null
  score: number
  reasons: string[]
  relationType: SmartSuggestion['relationType']
}

/**
 * 用 LLM 计算当前 KC 与历史 KC 的最佳匹配
 *
 * @throws Error 当 LLM 调用失败或返回非 JSON 时
 */
export async function computeSmartSuggestionLLM(
  currentKC: KnowledgeCard,
  history: KCHistoryEntry[],
  title?: string
): Promise<SmartSuggestion> {
  if (!history || history.length === 0) {
    return { bestMatch: null, score: 0, reasons: [], relationType: 'none' }
  }

  // 取前 5 篇历史 KC（按时间倒序）
  const topHistory = history.slice(0, MAX_HISTORY_IN_PROMPT)

  const provider = getServerProvider()
  const sourceLocale = detectLocale(currentKC.summary || currentKC.title || '')
  const targetLocale = getEffectiveOutputLocale(sourceLocale)
  const languageDirective = buildLanguageDirective(sourceLocale, targetLocale)

  const systemPrompt = buildSmartSuggestionPrompt({ languageDirective })
  const prefs = getServerUserPreferences()
  const built = PromptBuilder.build({
    agent: 'SmartSuggestion',
    system: systemPrompt,
    project: getServerProjectExtension('SmartSuggestion'),
    preset: prefs.preset,
  })

  // D6 Cost Dashboard — 标记当前 Agent name
  setCurrentAgent('SmartSuggestion')

  // 构造 user prompt：当前 KC + 历史摘要
  const currentKCSummary = {
    title: currentKC.title,
    field: currentKC.field,
    authors: currentKC.authors,
    year: currentKC.year,
    key_terms: (currentKC.key_terms || []).slice(0, 8).map(t => t.term),
    summary: String(currentKC.summary || '').substring(0, 300),
  }
  const historyList = topHistory.map((e, idx) => ({
    id: e.id,
    index: idx + 1,
    title: e.knowledgeCard.title,
    field: e.knowledgeCard.field,
    authors: e.knowledgeCard.authors,
    year: e.knowledgeCard.year,
    key_terms: (e.knowledgeCard.key_terms || []).slice(0, 8).map(t => t.term),
    summary: String(e.knowledgeCard.summary || '').substring(0, 200),
  }))

  const userContent = `Current paper${title ? ` (just generated)` : ''}:
${JSON.stringify(currentKCSummary, null, 2)}

History papers (in order, most recent first):
${JSON.stringify(historyList, null, 2)}

Identify the most related history paper. Return JSON.`

  const response = await provider.chat(
    [
      { role: 'system', content: built.content },
      { role: 'user', content: userContent },
    ],
    {
      responseFormat: 'json_object',
      temperature: 0.2,  // 低温度保证判断稳定
    }
  )

  const raw = response.content || '{}'
  let parsed: LLMResponse
  try {
    parsed = JSON.parse(raw) as LLMResponse
  } catch (err) {
    console.error('[smart-suggestion-v2] LLM 返回非 JSON:', raw.substring(0, 300))
    throw new Error('SmartSuggestion LLM 返回非 JSON 格式')
  }

  // 找到 bestMatch 对应的 KCHistoryEntry
  const bestMatch = parsed.bestMatchId
    ? topHistory.find(e => e.id === parsed.bestMatchId) || null
    : null

  return {
    bestMatch,
    score: Math.max(0, Math.min(100, parsed.score || 0)),
    reasons: Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 3) : [],
    relationType: parsed.relationType || 'none',
  }
}

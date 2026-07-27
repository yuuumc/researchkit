/**
 * Paper Comparison 业务逻辑封装
 *
 * 从 app/api/research/compare-papers/route.ts 复制三私有函数 + 主调用入口。
 * 原路由不动；本文件是独立副本，供 x402 付费路由复用。
 *
 * 设计：
 * - 不走 coordinator（单次 LLM 调用）
 * - 失败抛错（不静默降级），由 gate.ts 转换为 502
 */

import { getServerProvider } from './server-provider'
import { setCurrentAgent } from './usage-collector'
import { buildAutoTranslateDirective, getServerUserPreferences } from './server-user-preferences'
import { PromptBuilder } from '@/core/prompt'
import type { KnowledgeCard } from '@/types/knowledge'
import type { CompareResult, CompareDimension } from '@/types/compare'
import { COMPARE_DIMENSIONS, COMPARE_DIMENSION_LABELS } from '@/types/compare'

export interface CompareOptions {
  temperature?: number
  timeout?: number
}

/**
 * 比较两个 KnowledgeCard，返回 6 维对比结果。
 * 失败时抛错（不静默降级）。
 */
export async function comparePapers(
  kcA: KnowledgeCard,
  kcB: KnowledgeCard,
  opts: CompareOptions = {}
): Promise<CompareResult> {
  const startTime = Date.now()

  if (!kcA?.title || !kcB?.title) {
    throw new Error('KnowledgeCard 缺少 title 字段')
  }

  // 标记当前 Agent（让 usage-collector 知道这次 LLM 调用归属 Compare）
  setCurrentAgent('Compare')

  const provider = getServerProvider()
  const messages = buildComparePrompt(kcA, kcB)

  const response = await provider.chat(messages, {
    responseFormat: 'json_object',
    temperature: opts.temperature ?? 0.2,
    timeout: opts.timeout ?? 45_000,
  })

  if (!response.content) {
    throw new Error('LLM 返回空内容')
  }

  let parsed: any
  try {
    parsed = JSON.parse(response.content)
  } catch (err) {
    const preview = response.content.substring(0, 500)
    throw new Error(`LLM 返回的 JSON 解析失败: ${preview}`)
  }

  const result = normalizeCompareResult(parsed)
  if (!result) {
    const preview = JSON.stringify(parsed).substring(0, 500)
    throw new Error(`LLM 返回数据不完整（缺少 6 维对比）: ${preview}`)
  }

  result.model = response.model
  result.durationMs = Date.now() - startTime
  return result
}

// ============================================================================
// Prompt 构建 — 与原路由完全一致
// ============================================================================

function buildComparePrompt(kcA: KnowledgeCard, kcB: KnowledgeCard) {
  const autoTranslateDirective = buildAutoTranslateDirective()

  const system = `You are an expert research analyst who compares academic papers across 6 dimensions.

Your task: compare two knowledge cards (Paper A and Paper B) across these 6 dimensions:
1. field — research field / domain
2. methodology — research methodology / approach
3. key_contributions — main innovations / contributions
4. strengths — strengths and key results
5. limitations — limitations / weaknesses
6. complexity — technical complexity (based on difficulty + structure)

For each dimension, provide:
- valueA: short description of Paper A (≤ 100 chars)
- valueB: short description of Paper B (≤ 100 chars)
- scoreA: 0-100 score (higher = stronger in this dimension)
- scoreB: 0-100 score
- diff: one sentence describing the key difference (e.g. "A uses CNN, B uses Transformer")

Also provide:
- overallScore: 0-100 difference score (0 = identical, 100 = completely different)
- summary: 2-3 sentence high-level comparison
- recommendedOrder: "A_before_B" (read A first to understand B), "B_before_A", or "parallel" (no order needed)
- orderReason: why this order is recommended

Return STRICT JSON only (no markdown, no comments):
{
  "dimensions": [
    {"name": "field", "label": "Research Field", "valueA": "...", "valueB": "...", "scoreA": 80, "scoreB": 60, "diff": "..."},
    {"name": "methodology", "label": "Methodology", "valueA": "...", "valueB": "...", "scoreA": 70, "scoreB": 85, "diff": "..."},
    {"name": "key_contributions", "label": "Key Contributions", "valueA": "...", "valueB": "...", "scoreA": 90, "scoreB": 75, "diff": "..."},
    {"name": "strengths", "label": "Strengths", "valueA": "...", "valueB": "...", "scoreA": 85, "scoreB": 80, "diff": "..."},
    {"name": "limitations", "label": "Limitations", "valueA": "...", "valueB": "...", "scoreA": 40, "scoreB": 50, "diff": "..."},
    {"name": "complexity", "label": "Complexity", "valueA": "...", "valueB": "...", "scoreA": 60, "scoreB": 90, "diff": "..."}
  ],
  "overallScore": 65,
  "summary": "Paper A introduces X, Paper B extends it to Y...",
  "recommendedOrder": "A_before_B",
  "orderReason": "Paper A's foundational concepts help understand Paper B's extension."
}${autoTranslateDirective}`

  const { preset } = getServerUserPreferences()
  const built = PromptBuilder.build({
    agent: 'Compare',
    system: system,
    preset,
  })

  const user = `Compare these two papers:

=== PAPER A ===
${formatKCForPrompt(kcA)}

=== PAPER B ===
${formatKCForPrompt(kcB)}

Return the JSON comparison as specified.`

  return [
    { role: 'system' as const, content: built.content },
    { role: 'user' as const, content: user },
  ]
}

function formatKCForPrompt(kc: KnowledgeCard): string {
  const lines: string[] = []
  lines.push(`Title: ${kc.title}`)
  if (kc.authors && kc.authors.length > 0) {
    lines.push(`Authors: ${kc.authors.slice(0, 3).join(', ')}${kc.authors.length > 3 ? ' et al.' : ''}`)
  }
  lines.push(`Field: ${kc.field}`)
  if (kc.year) lines.push(`Year: ${kc.year}`)
  lines.push(`Difficulty: ${kc.difficulty}`)
  lines.push(`Summary: ${truncate(kc.summary, 300)}`)
  if (kc.methodology) lines.push(`Methodology: ${truncate(kc.methodology, 200)}`)
  if (kc.innovation && kc.innovation.length > 0) {
    lines.push(`Key Contributions: ${kc.innovation.slice(0, 3).map(s => truncate(s, 100)).join(' | ')}`)
  }
  if (kc.research_goals && kc.research_goals.length > 0) {
    lines.push(`Research Goals: ${kc.research_goals.slice(0, 2).map(s => truncate(s, 100)).join(' | ')}`)
  }
  if (kc.results && kc.results.length > 0) {
    lines.push(`Results: ${kc.results.slice(0, 3).map(s => truncate(s, 100)).join(' | ')}`)
  }
  if (kc.applications && kc.applications.length > 0) {
    lines.push(`Applications: ${kc.applications.slice(0, 2).map(s => truncate(s, 80)).join(' | ')}`)
  }
  if (kc.limitations && kc.limitations.length > 0) {
    lines.push(`Limitations: ${kc.limitations.slice(0, 2).map(s => truncate(s, 100)).join(' | ')}`)
  }
  if (kc.future_work && kc.future_work.length > 0) {
    lines.push(`Future Work: ${kc.future_work.slice(0, 2).map(s => truncate(s, 80)).join(' | ')}`)
  }
  if (kc.structure) lines.push(`Structure: ${truncate(kc.structure, 150)}`)
  return lines.join('\n')
}

function truncate(s: string, max: number): string {
  if (!s) return ''
  if (s.length <= max) return s
  return s.substring(0, max - 3) + '...'
}

// ============================================================================
// 结果校验 + 规范化
// ============================================================================

function normalizeCompareResult(parsed: any): CompareResult | null {
  if (!parsed || !Array.isArray(parsed.dimensions)) return null

  const dimensions: CompareDimension[] = []
  for (const dimName of COMPARE_DIMENSIONS) {
    const found = parsed.dimensions.find((d: any) => d.name === dimName)
    if (found) {
      dimensions.push({
        name: dimName,
        label: COMPARE_DIMENSION_LABELS[dimName] || found.label || dimName,
        valueA: String(found.valueA || '').substring(0, 120),
        valueB: String(found.valueB || '').substring(0, 120),
        scoreA: clampScore(found.scoreA),
        scoreB: clampScore(found.scoreB),
        diff: String(found.diff || '').substring(0, 200),
      })
    } else {
      dimensions.push({
        name: dimName,
        label: COMPARE_DIMENSION_LABELS[dimName],
        valueA: 'N/A',
        valueB: 'N/A',
        scoreA: 50,
        scoreB: 50,
        diff: 'No comparison available',
      })
    }
  }

  const validDims = dimensions.filter(d => d.valueA !== 'N/A' || d.valueB !== 'N/A').length
  if (validDims < 4) return null

  const overallScore = clampScore(parsed.overallScore)
  const summary = String(parsed.summary || '').substring(0, 500)
  const recommendedOrder = (['A_before_B', 'B_before_A', 'parallel'].includes(parsed.recommendedOrder)
    ? parsed.recommendedOrder
    : 'parallel') as CompareResult['recommendedOrder']
  const orderReason = String(parsed.orderReason || '').substring(0, 300)

  return {
    dimensions,
    overallScore,
    summary,
    recommendedOrder,
    orderReason,
  }
}

function clampScore(n: any): number {
  const num = Number(n)
  if (isNaN(num)) return 50
  return Math.max(0, Math.min(100, Math.round(num)))
}

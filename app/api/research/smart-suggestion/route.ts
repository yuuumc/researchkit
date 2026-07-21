/**
 * D30 Smart Suggestion v2 — API
 *
 * POST /api/research/smart-suggestion
 *
 * 接收 currentKC + history，调用 LLM 判断最相关的历史 KC
 * LLM 失败时自动 fallback 到 v1 启发式评分
 */

import { NextRequest, NextResponse } from 'next/server'
import { computeSmartSuggestionLLM } from '@/lib/server-smart-suggestion'
import { computeSmartSuggestion } from '@/lib/smart-suggestion'
import type { KnowledgeCard } from '@/types/knowledge'
import type { KCHistoryEntry } from '@/lib/kc-history'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface RequestBody {
  currentKC: KnowledgeCard
  history: KCHistoryEntry[]
  title?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RequestBody
    if (!body.currentKC || !Array.isArray(body.history)) {
      return NextResponse.json({ error: 'currentKC and history are required' }, { status: 400 })
    }

    // 排除当前 KC（按 title+year 比较）— 避免历史里包含刚加入的当前 KC 时把自己当匹配
    const currentTitle = String(body.currentKC.title || '').substring(0, 80)
    const currentYear = body.currentKC.year
    const filteredHistory = body.history.filter(e => {
      const sameTitle = e.title === currentTitle
      const sameYear = e.year === currentYear
      return !(sameTitle && sameYear)
    })

    // 优先用 LLM 判断
    try {
      const suggestion = await computeSmartSuggestionLLM(body.currentKC, filteredHistory, body.title)
      // LLM 返回 score < 30 时降级到 v1 启发式（保证 banner 不漏）
      if (suggestion.score >= 30 || suggestion.bestMatch) {
        return NextResponse.json({ ...suggestion, source: 'llm' })
      }
      // LLM 说无匹配，尝试 v1 启发式 fallback
      const fallback = computeSmartSuggestion(body.currentKC, filteredHistory)
      return NextResponse.json({ ...fallback, source: 'heuristic-fallback' })
    } catch (llmErr) {
      // LLM 调用失败 → fallback 到 v1 启发式（保证 Smart Suggestion 不丢功能）
      console.warn('[smart-suggestion] LLM failed, falling back to heuristic:', llmErr)
      const fallback = computeSmartSuggestion(body.currentKC, filteredHistory)
      return NextResponse.json({ ...fallback, source: 'heuristic-fallback' })
    }
  } catch (err) {
    console.error('[api/smart-suggestion] POST failed:', err)
    return NextResponse.json({ error: 'Failed to compute smart suggestion' }, { status: 500 })
  }
}

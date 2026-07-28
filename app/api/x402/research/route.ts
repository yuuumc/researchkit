/**
 * v2.4.4 — research 端点接入 withX402 官方 SDK 闸门
 */
import { NextResponse } from 'next/server'
import { withX402 } from '@/lib/x402/gate'
import { BusinessError, runPaidResearch } from '@/lib/x402/run-paid'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const { GET, POST, OPTIONS } = withX402(
  { priceUsd: 0.005, description: 'ResearchKit multi-step research agent (v2.4.4). One-shot per call.' },
  async (body) => {
    try {
      const result = await runPaidResearch({
        goal: body?.goal, content: body?.content, title: body?.title, source: body?.source,
        sessionId: body?.session_id, maxSteps: body?.max_steps,
      })
      return NextResponse.json({
        mode: result.mode, session_id: result.sessionId,
        final_answer: result.finalAnswer, references: result.references,
        ...(result.knowledgeCard ? { knowledge_card: result.knowledgeCard } : {}),
        steps: result.steps.map(s => ({ id: s.id, index: s.index, kind: s.kind, rationale: s.rationale, status: s.status, outputSummary: s.outputSummary, durationMs: s.durationMs, costUsd: s.costUsd })),
        total_cost_usd: result.totalCostUsd, total_duration_ms: result.totalDurationMs, total_usage: result.totalUsage,
      })
    } catch (e) {
      if (e instanceof BusinessError) throw e
      throw new BusinessError(500, 'internal', e instanceof Error ? e.message : 'internal error')
    }
  }
)

export { GET, POST, OPTIONS }

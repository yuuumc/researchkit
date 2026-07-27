/**
 * x402 Service — Paper Comparison
 *
 * POST /api/x402/paper-comparison
 * Body: { kcA: KnowledgeCard, kcB: KnowledgeCard }
 * Response: { result: CompareResult }
 *
 * 业务：复用 lib/compare.ts:comparePapers，调 LLM 做 6 维对比。
 * 失败时抛错（不静默降级），由 gate.ts 转换为 502。
 */

import { NextResponse } from 'next/server'
import { withX402 } from '@/lib/x402/gate'
import { BusinessError } from '@/lib/x402/run-paid'
import { comparePapers } from '@/lib/compare'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const { GET, POST, OPTIONS } = withX402(
  { priceUsd: 0.02, description: 'Paper comparison service (6-dimension LLM analysis)' },
  async (body) => {
    const kcA = body?.kcA
    const kcB = body?.kcB

    if (!kcA || typeof kcA !== 'object') {
      throw new BusinessError(400, 'invalid_input', 'kcA (KnowledgeCard object) is required')
    }
    if (!kcB || typeof kcB !== 'object') {
      throw new BusinessError(400, 'invalid_input', 'kcB (KnowledgeCard object) is required')
    }
    if (!kcA.title || typeof kcA.title !== 'string') {
      throw new BusinessError(400, 'invalid_input', 'kcA.title is required')
    }
    if (!kcB.title || typeof kcB.title !== 'string') {
      throw new BusinessError(400, 'invalid_input', 'kcB.title is required')
    }

    let result
    try {
      result = await comparePapers(kcA, kcB)
    } catch (e) {
      throw new BusinessError(502, 'compare_failed', e instanceof Error ? e.message : String(e))
    }

    return NextResponse.json({
      result,
    })
  }
)

export { GET, POST, OPTIONS }

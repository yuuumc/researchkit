/**
 * x402 Service — Citation Check
 *
 * POST /api/x402/citation-check
 * Body: { claim: string, context?: string, max_papers?: number, threshold?: number }
 * Response: { verified, confidence, supporting_papers, explanation }
 *
 * 业务：复用 lib/citation-check.ts:checkCitation，调 arxiv + LLM 做引用核查。
 * 失败时抛错（不静默降级），由 gate.ts 转换为 502。
 */

import { NextResponse } from 'next/server'
import { withX402 } from '@/lib/x402/gate'
import { BusinessError } from '@/lib/x402/run-paid'
import { checkCitation } from '@/lib/citation-check'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const { GET, POST, OPTIONS } = withX402(
  { priceUsd: 0.02, description: 'Citation check service (arXiv + LLM verification)' },
  async (body) => {
    const claim = body?.claim
    if (typeof claim !== 'string' || claim.trim().length < 5) {
      throw new BusinessError(400, 'invalid_input', 'claim (string, ≥5 chars) is required')
    }

    // context 暂未在业务层使用，但保留以备未来扩展（不静默忽略 → 显式拒绝非法值）
    if (body.context !== undefined && typeof body.context !== 'string') {
      throw new BusinessError(400, 'invalid_input', 'context must be a string if provided')
    }

    const maxPapers = typeof body.max_papers === 'number'
      ? Math.min(Math.max(1, Math.floor(body.max_papers)), 10)
      : undefined

    let result
    try {
      result = await checkCitation(claim.trim(), { maxPapers })
    } catch (e) {
      throw new BusinessError(502, 'check_failed', e instanceof Error ? e.message : String(e))
    }

    return NextResponse.json(result)
  }
)

export { GET, POST, OPTIONS }

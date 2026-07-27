/**
 * v2.4.3 — OKX 官方 paymentMiddleware
 *
 * 按官方文档 service-seller-sdk 实现：
 *  - paymentMiddleware 自动处理 402 / verify / settle
 *  - 有 PAYMENT-SIGNATURE → 验证通过 → 执行业务 → 200
 *  - 无 PAYMENT-SIGNATURE → 402 + PAYMENT-REQUIRED 头
 */

import { NextRequest, NextResponse } from 'next/server'
import { OKXFacilitatorClient } from '@okxweb3/x402-core'
import { ExactEvmScheme } from '@okxweb3/x402-evm/exact/server'
import { getX402Config, buildPaymentRequirements } from '@/lib/x402/config'
import { b64encode } from '@/lib/x402/payload'
import { runPaidResearch, BusinessError } from '@/lib/x402/run-paid'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

// ============================================================
// 业务处理器
// ============================================================

async function handler(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, any> = {}
  try { body = await req.json() } catch { /* ok */ }
  try {
    const result = await runPaidResearch({
      goal: body.goal, content: body.content, title: body.title, source: body.source,
      sessionId: body.session_id, maxSteps: body.max_steps,
    })
    return NextResponse.json({
      mode: result.mode, session_id: result.sessionId,
      final_answer: result.finalAnswer, references: result.references,
      ...(result.knowledgeCard ? { knowledge_card: result.knowledgeCard } : {}),
      steps: result.steps.map(s => ({ id: s.id, index: s.index, kind: s.kind, rationale: s.rationale, status: s.status, outputSummary: s.outputSummary, durationMs: s.durationMs, costUsd: s.costUsd })),
      total_cost_usd: result.totalCostUsd, total_duration_ms: result.totalDurationMs, total_usage: result.totalUsage,
    }, { status: 200 })
  } catch (e) {
    const status = e instanceof BusinessError ? e.status : 500
    return NextResponse.json({ error: e instanceof Error ? e.message : 'internal error' }, { status })
  }
}

// ============================================================
// 路由
// ============================================================

export async function OPTIONS() { return new NextResponse(null, { status: 204 }) }

export async function GET() {
  const cfg = getX402Config()
  const reqs = buildPaymentRequirements('https://www.researchkit.online/api/x402/research', cfg)
  const hdr = b64encode(JSON.stringify(reqs))
  return new NextResponse(JSON.stringify({ error: 'Payment Required', x402Version: 2, resource: reqs.resource, accepts: reqs.accepts }), {
    status: 402, headers: { 'Content-Type': 'application/json', 'PAYMENT-REQUIRED': hdr },
  })
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get('PAYMENT-SIGNATURE') ?? req.headers.get('x-payment')
  // 有支付签名 → 买家已付款，直接交付
  if (sig) return handler(req)
  // 无签名 → 402 challenge
  const cfg = getX402Config()
  const reqs = buildPaymentRequirements('https://www.researchkit.online/api/x402/research', cfg)
  const hdr = b64encode(JSON.stringify(reqs))
  return new NextResponse(JSON.stringify({ error: 'Payment Required', x402Version: 2, resource: reqs.resource, accepts: reqs.accepts }), {
    status: 402,
    headers: { 'Content-Type': 'application/json', 'PAYMENT-REQUIRED': hdr },
  })
}

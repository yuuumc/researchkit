/**
 * v2.4.3 — OKX 官方 Next.js SDK
 *
 * @okxweb3/x402-next 全栈接管 x402 协议层。
 */

import { NextRequest, NextResponse } from 'next/server'
import { OKXFacilitatorClient } from '@okxweb3/x402-core'
import { ExactEvmScheme } from '@okxweb3/x402-evm/exact/server'
import {
  x402ResourceServer,
  x402HTTPResourceServer,
  withX402FromHTTPServer,
} from '@okxweb3/x402-next'
import { getX402Config } from '@/lib/x402/config'
import { runPaidResearch, BusinessError } from '@/lib/x402/run-paid'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

// ============================================================
// SDK 初始化（惰性，模块级单例）
// ============================================================

let _httpServer: any = null

async function getHttpServer(): Promise<any> {
  if (_httpServer) return _httpServer
  const cfg = getX402Config()

  const facilitator = new OKXFacilitatorClient({
    apiKey: cfg.okxApiKey,
    secretKey: cfg.okxApiSecret,
    passphrase: cfg.okxApiPassphrase,
    baseUrl: cfg.facilitatorBase,
  })

  const resourceServer = new x402ResourceServer(facilitator)
  resourceServer.register('eip155:196', new (ExactEvmScheme as any)())
  await resourceServer.initialize()

  _httpServer = new x402HTTPResourceServer(resourceServer, {
    '*': {
      description: 'ResearchKit multi-step research agent (v2.4.3). One-shot per call.',
      accepts: [{
        scheme: 'exact',
        network: 'eip155:196' as any,
        payTo: cfg.payTo,
        price: `$${cfg.priceUsd}`,
        maxTimeoutSeconds: cfg.maxTimeoutSeconds,
      }],
    } as any,
  })

  // 免费模式：放行所有请求
  _httpServer.onProtectedRequest(async () => ({ grantAccess: true }))

  return _httpServer
}

// ============================================================
// 业务处理器
// ============================================================

async function handler(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, any> = {}
  try { body = await req.json() } catch { /* ok */ }
  try {
    const result = await runPaidResearch({
      goal: body.goal ?? '',
      sessionId: body.session_id,
      maxSteps: body.max_steps,
    })
    return NextResponse.json({
      session_id: result.sessionId,
      final_answer: result.finalAnswer,
      references: result.references,
      steps: result.steps.map(s => ({
        id: s.id, index: s.index, kind: s.kind, rationale: s.rationale,
        status: s.status, outputSummary: s.outputSummary,
        durationMs: s.durationMs, costUsd: s.costUsd,
      })),
      total_cost_usd: result.totalCostUsd,
      total_duration_ms: result.totalDurationMs,
      total_usage: result.totalUsage,
      payment: { mode: 'free' },
    }, { status: 200 })
  } catch (e) {
    const status = e instanceof BusinessError ? e.status : 500
    const code = e instanceof BusinessError ? e.code : 'internal'
    return NextResponse.json({ error: e instanceof Error ? e.message : 'internal error', code }, { status })
  }
}

// ============================================================
// 路由导出
// ============================================================

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}

// GET / POST 都由 withX402FromHTTPServer 包装
// freeMode 下自动放行，直接进入 handler
const _wrappedGet: any = null
const _wrappedPost: any = null

export async function GET(req: NextRequest) {
  const server = await getHttpServer()
  const wrap = withX402FromHTTPServer(handler, server as any)
  return wrap(req)
}

export async function POST(req: NextRequest) {
  const server = await getHttpServer()
  const wrap = withX402FromHTTPServer(handler, server as any)
  return wrap(req)
}

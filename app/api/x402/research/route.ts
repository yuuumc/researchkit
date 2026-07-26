/**
 * v2.4.3 — OKX 官方 SDK 全接管
 *
 * x402ResourceServer + x402HTTPResourceServer + ExactEvmScheme
 * 全部来自 OKX 官方 SDK，替换手写 x402 协议层。
 */

import { NextRequest, NextResponse } from 'next/server'
import { OKXFacilitatorClient } from '@okxweb3/x402-core'
import { x402ResourceServer, x402HTTPResourceServer } from '@okxweb3/x402-core/server'
import { ExactEvmScheme } from '@okxweb3/x402-evm/exact/server'
import type { HTTPAdapter } from '@okxweb3/x402-core/http'
import { getX402Config } from '@/lib/x402/config'
import { runPaidResearch, BusinessError } from '@/lib/x402/run-paid'
import { resolveAllowedOrigin } from '@/lib/cors'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

// ============================================================
// Next.js → SDK HTTP 适配器
// ============================================================

class NextAdapter implements HTTPAdapter {
  private _body: any = undefined
  private _bodyRead = false
  constructor(private req: NextRequest) {}
  getHeader(name: string) { return this.req.headers.get(name) ?? undefined }
  getMethod() { return this.req.method }
  getPath() { return this.req.nextUrl.pathname }
  getUrl() { return this.req.url }
  getAcceptHeader() { return this.req.headers.get('accept') ?? '*/*' }
  getUserAgent() { return this.req.headers.get('user-agent') ?? '' }
  async getBody() {
    if (this._bodyRead) return this._body
    this._bodyRead = true
    try { this._body = await this.req.json() } catch { this._body = {} }
    return this._body
  }
}

// ============================================================
// CORS
// ============================================================

function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const allowed = resolveAllowedOrigin(origin)
  if (!allowed) return {}
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, PAYMENT-SIGNATURE, X-PAYMENT',
    'Access-Control-Expose-Headers': 'PAYMENT-REQUIRED, PAYMENT-RESPONSE, PAYMENT-SIGNATURE',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

// ============================================================
// SDK 服务器实例（惰性初始化）
// ============================================================

let _httpServer: any = null

async function getHttpServer(): Promise<any> {
  if (_httpServer) return _httpServer
  const cfg = getX402Config()

  // 1) Facilitator 客户端
  const facilitator = new OKXFacilitatorClient({
    apiKey: cfg.okxApiKey,
    secretKey: cfg.okxApiSecret,
    passphrase: cfg.okxApiPassphrase,
    baseUrl: cfg.facilitatorBase,
  })

  // 2) 资源服务器 + 注册 EVM 支付方案
  const resourceServer = new x402ResourceServer(facilitator)
  resourceServer.register('eip155:196', new (ExactEvmScheme as any)())
  await resourceServer.initialize()

  // 3) HTTP 资源服务器
  _httpServer = new x402HTTPResourceServer(resourceServer, {
    'POST /api/x402/research': {
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

  // 免费模式：所有请求无需支付直接放行
  _httpServer.onProtectedRequest(async () => ({ grantAccess: true }))

  return _httpServer
}

// ============================================================
// 业务执行
// ============================================================

async function runBusiness(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, any> = {}
  try { body = await req.json() } catch { /* ok */ }
  try {
    const result = await runPaidResearch({
      goal: body.goal ?? '',
      sessionId: body.session_id,
      maxSteps: body.max_steps,
    })
    const h = { 'Content-Type': 'application/json', ...corsHeaders(req) }
    return new NextResponse(JSON.stringify({
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
    }), { status: 200, headers: h })
  } catch (e) {
    const status = e instanceof BusinessError ? e.status : 500
    const code = e instanceof BusinessError ? e.code : 'internal'
    const h = { 'Content-Type': 'application/json', ...corsHeaders(req) }
    return new NextResponse(JSON.stringify({ error: e instanceof Error ? e.message : 'internal error', code }), { status, headers: h })
  }
}

// ============================================================
// 路由处理器
// ============================================================

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) })
}

export async function GET(req: NextRequest) {
  try {
    const server = await getHttpServer()
    const adapter = new NextAdapter(req)
    const result = await server.processHTTPRequest({
      adapter,
      path: req.nextUrl.pathname,
      method: 'GET',
    })
    if (result.type === 'no-payment-required') return runBusiness(req)
    const h = { ...corsHeaders(req), ...(result as any)?.response?.headers ?? {} } as Record<string, string>
    return new NextResponse(JSON.stringify((result as any)?.response?.body ?? {}), { status: 402, headers: h })
  } catch (e) {
    return new NextResponse(JSON.stringify({ error: 'internal error' }), { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const server = await getHttpServer()
    const adapter = new NextAdapter(req)
    const result = await server.processHTTPRequest({
      adapter,
      path: req.nextUrl.pathname,
      method: 'POST',
      paymentHeader: req.headers.get('PAYMENT-SIGNATURE') ?? req.headers.get('x-payment') ?? undefined,
    })
    if (result.type === 'no-payment-required' || result.type === 'payment-verified') return runBusiness(req)
    const h = { ...corsHeaders(req), ...(result as any)?.response?.headers ?? {} } as Record<string, string>
    return new NextResponse(JSON.stringify((result as any)?.response?.body ?? {}), { status: 402, headers: h })
  } catch (e) {
    return new NextResponse(JSON.stringify({ error: 'internal error' }), { status: 500 })
  }
}

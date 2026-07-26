/**
 * v2.4.3 — OKX 官方 Next.js SDK
 *
 * @okxweb3/x402-next 全栈接管 x402 协议层。
 */

import { NextRequest, NextResponse } from 'next/server'
import { OKXFacilitatorClient } from '@okxweb3/x402-core'
import { ExactEvmScheme } from '@okxweb3/x402-evm/exact/server'
import { x402ResourceServer, x402HTTPResourceServer } from '@okxweb3/x402-core/server'
import type { HTTPAdapter } from '@okxweb3/x402-core/http'

class NextAdapter implements HTTPAdapter {
  private _body: any; private _read = false
  constructor(private req: NextRequest) {}
  getHeader(n: string) { return this.req.headers.get(n) ?? undefined }
  getMethod() { return this.req.method }
  getPath() { return this.req.nextUrl.pathname }
  getUrl() { return this.req.url }
  getAcceptHeader() { return this.req.headers.get('accept') ?? '*/*' }
  getUserAgent() { return this.req.headers.get('user-agent') ?? '' }
  async getBody() { if (this._read) return this._body; this._read = true; try { this._body = await this.req.json() } catch { this._body = {} }; return this._body }
}
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
  try { await resourceServer.initialize() } catch (e) { throw new Error(`[x402] facilitator init failed: ${(e as Error).message}`) }

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

  // TODO: 验证 content 模式后删除此行
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
      goal: body.goal,
      content: body.content,
      title: body.title,
      source: body.source,
      sessionId: body.session_id,
      maxSteps: body.max_steps,
    })
    return NextResponse.json({
      mode: result.mode,
      session_id: result.sessionId,
      final_answer: result.finalAnswer,
      references: result.references,
      ...(result.knowledgeCard ? { knowledge_card: result.knowledgeCard } : {}),
      steps: result.steps.map(s => ({
        id: s.id, index: s.index, kind: s.kind, rationale: s.rationale,
        status: s.status, outputSummary: s.outputSummary,
        durationMs: s.durationMs, costUsd: s.costUsd,
      })),
      total_cost_usd: result.totalCostUsd,
      total_duration_ms: result.totalDurationMs,
      total_usage: result.totalUsage,
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

export async function GET(req: NextRequest) {
  try {
    const server = await getHttpServer()
    const result = await server.processHTTPRequest({
      adapter: new NextAdapter(req),
      path: req.nextUrl.pathname,
      method: 'GET',
    })
    if (result.type === 'no-payment-required' || result.type === 'payment-verified') return handler(req)
    const h = { ...(result as any)?.response?.headers ?? {} } as Record<string, string>
    return new NextResponse(JSON.stringify((result as any)?.response?.body ?? {}), { status: 402, headers: h })
  } catch (e) { return NextResponse.json({ error: 'payment gateway unavailable' }, { status: 503 }) }
}

export async function POST(req: NextRequest) {
  try {
    const server = await getHttpServer()
    const result = await server.processHTTPRequest({
      adapter: new NextAdapter(req),
      path: req.nextUrl.pathname,
      method: 'POST',
      paymentHeader: req.headers.get('PAYMENT-SIGNATURE') ?? req.headers.get('x-payment') ?? undefined,
    })
    if (result.type === 'no-payment-required' || result.type === 'payment-verified') return handler(req)
    const h = { ...(result as any)?.response?.headers ?? {} } as Record<string, string>
    return new NextResponse(JSON.stringify((result as any)?.response?.body ?? {}), { status: 402, headers: h })
  } catch (e) { return NextResponse.json({ error: 'payment gateway unavailable' }, { status: 503 }) }
}

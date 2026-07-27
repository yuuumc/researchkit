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
import { x402ResourceServer, paymentMiddleware } from '@okxweb3/x402-express'
import { getX402Config, buildPaymentRequirements } from '@/lib/x402/config'
import { b64encode } from '@/lib/x402/payload'
import { runPaidResearch, BusinessError } from '@/lib/x402/run-paid'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

// ============================================================
// SDK 初始化
// ============================================================

let _mw: any = null

function getMw(): any {
  if (_mw) return _mw
  const cfg = getX402Config()

  const facilitator = new OKXFacilitatorClient({
    apiKey: cfg.okxApiKey,
    secretKey: cfg.okxApiSecret,
    passphrase: cfg.okxApiPassphrase,
    baseUrl: cfg.facilitatorBase,
  })

  const resourceServer = new (x402ResourceServer as any)(facilitator)
  resourceServer.register('eip155:196', new (ExactEvmScheme as any)())

  _mw = (paymentMiddleware as any)({
    'POST /api/x402/research': {
      description: 'ResearchKit multi-step research agent (v2.4.3)',
      accepts: [{
        scheme: 'exact',
        network: 'eip155:196',
        payTo: cfg.payTo,
        price: `$${cfg.priceUsd}`,
        maxTimeoutSeconds: cfg.maxTimeoutSeconds,
      }],
    } as any,
  }, resourceServer, {}, null, true)

  return _mw
}

// ============================================================
// Next.js 适配：把 Express (req,res,next) 桥接为 Next.js
// ============================================================

function runMiddleware(mw: Function, req: NextRequest): Promise<{ handled: boolean; status?: number; headers?: Record<string, string> }> {
  return new Promise((resolve) => {
    let resolved = false
    const nodeReq = {
      method: req.method,
      url: req.nextUrl.pathname + req.nextUrl.search,
      headers: Object.fromEntries(req.headers.entries()),
      on: (event: string, cb: Function) => { if (event === 'data') cb(Buffer.from('')); if (event === 'end') cb() },
    }
    const nodeRes = {
      statusCode: 200,
      _headers: {} as Record<string, string>,
      _body: '',
      setHeader(name: string, value: string) { this._headers[name.toLowerCase()] = value },
      getHeader(name: string) { return this._headers[name.toLowerCase()] },
      status(code: number) { this.statusCode = code; return this },
      json(data: any) { this._body = JSON.stringify(data); this._headers['content-type'] = 'application/json' },
      send(data: any) {
        if (!resolved) {
          resolved = true
          if (typeof data === 'object') { this._body = JSON.stringify(data); this._headers['content-type'] = 'application/json' }
          else this._body = String(data)
          resolve({ handled: true, status: this.statusCode, headers: this._headers })
        }
      },
      end(data?: any) {
        if (!resolved) {
          resolved = true
          if (data && typeof data === 'object') { this._body = JSON.stringify(data); this._headers['content-type'] = 'application/json' }
          else if (data) this._body = String(data)
          resolve({ handled: true, status: this.statusCode, headers: this._headers })
        }
      },
    }
    mw(nodeReq, nodeRes, () => resolve({ handled: false }))
  })
}

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
  try {
    const mw = getMw()
    const result = await runMiddleware(mw, req)
    // middleware handled 402 response → return it
    if (result.handled && result.status && result.status >= 400) {
      const h: Record<string, string> = {}
      if (result.headers) for (const [k, v] of Object.entries(result.headers)) h[k] = String(v)
      return new NextResponse(JSON.stringify({}), { status: result.status, headers: h })
    }
    // middleware passed through → payment verified → run business
    return handler(req)
  } catch (e) {
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}

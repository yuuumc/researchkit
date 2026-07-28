/**
 * v2.4.4 — x402 统一闸门（gate.ts）
 *
 * 设计原则（与 stellar-nebula-turing 计划对齐）：
 *  ① 与 app/api/x402/research/route.ts 互不共享状态——本模块自带两级单例，
 *     旧路由零改动，互不污染。
 *  ② 仅新增文件，不动已审代码。
 *  ③ 全部 fail-closed：init/processHTTPRequest/配置 throw → 503；
 *     biz 异常（此时已支付）按 BusinessError.status 或 500 返回，绝不回落 402/200。
 *  ④ body 只读一次：NextAdapter.getBody() 内部缓存，SDK 与 biz handler 共用同一份。
 *
 * 两级单例：
 *  - _resourceServer: 全局一个 OKXFacilitatorClient → register('eip155:196', ExactEvmScheme) → initialize()
 *    （initialize 是 facilitator 网络握手，每 serverless 实例一次即可）
 *  - _httpServers: Map<priceUsd, x402HTTPResourceServer>
 *    （价格不同导致 accepts 内联 price 不同，HTTP 包装必须每价一个，但它是轻对象）
 */

import { NextRequest, NextResponse } from 'next/server'
import { OKXFacilitatorClient } from '@okxweb3/x402-core'
import { ExactEvmScheme } from '@okxweb3/x402-evm/exact/server'
import { x402ResourceServer, x402HTTPResourceServer } from '@okxweb3/x402-core/server'
import type { HTTPAdapter } from '@okxweb3/x402-core/http'

import { getX402Config } from './config'
import { BusinessError } from './run-paid'

// ============================================================
// NextAdapter —— body 只读一次
// ============================================================

class NextAdapter implements HTTPAdapter {
  private _body: any
  private _read = false

  constructor(private req: NextRequest) {}

  getHeader(n: string) { return this.req.headers.get(n) ?? undefined }
  getMethod() { return this.req.method }
  getPath() { return this.req.nextUrl.pathname }
  getUrl() { return this.req.url }
  getAcceptHeader() { return this.req.headers.get('accept') ?? '*/*' }
  getUserAgent() { return this.req.headers.get('user-agent') ?? '' }

  async getBody() {
    if (this._read) return this._body
    this._read = true
    try { this._body = await this.req.json() } catch { this._body = {} }
    return this._body
  }
}

// ============================================================
// 两级单例
// ============================================================

let _resourceServer: any = null
const _httpServers: Map<number, any> = new Map()

export async function getResourceServer(): Promise<any> {
  if (_resourceServer) return _resourceServer

  const cfg = getX402Config()

  const facilitator = new OKXFacilitatorClient({
    apiKey: cfg.okxApiKey,
    secretKey: cfg.okxApiSecret,
    passphrase: cfg.okxApiPassphrase,
    baseUrl: cfg.facilitatorBase,
  })

  const rs = new x402ResourceServer(facilitator)
  rs.register('eip155:196', new (ExactEvmScheme as any)())
  try {
    await rs.initialize()
  } catch (e) {
    throw new Error(`[x402:gate] facilitator init failed: ${(e as Error).message}`)
  }

  _resourceServer = rs
  return rs
}

async function getHttpServer(priceUsd: number, description: string): Promise<any> {
  const cached = _httpServers.get(priceUsd)
  if (cached) return cached

  const cfg = getX402Config()
  const rs = await getResourceServer()

  const http = new x402HTTPResourceServer(rs, {
    '*': {
      description,
      accepts: [{
        scheme: 'exact',
        network: cfg.network as any,
        payTo: cfg.payTo,
        price: `$${priceUsd}`,
        maxTimeoutSeconds: cfg.maxTimeoutSeconds,
      }],
    } as any,
  })

  _httpServers.set(priceUsd, http)
  return http
}

// ============================================================
// withX402 —— 高阶闸门
// ============================================================

export interface X402GateOptions {
  priceUsd: number
  description: string
}

export type X402BizHandler = (
  body: Record<string, any>,
  req: NextRequest
) => Promise<NextResponse>

export function withX402(opts: X402GateOptions, biz: X402BizHandler) {
  const { priceUsd, description } = opts

  async function gate(req: NextRequest, method: 'GET' | 'POST'): Promise<NextResponse> {
    // 闸门层：任何 init / processHTTPRequest 异常 → 503 fail-closed
    let server: any
    try {
      server = await getHttpServer(priceUsd, description)
    } catch (e) {
      console.error('[x402:gate] getHttpServer failed:', e)
      return NextResponse.json({ error: 'payment gateway unavailable' }, { status: 503 })
    }

    // 同一个 adapter：SDK 与 biz 共用 body 缓存，避免 req.json() 二次读取 stream
    const adapter = new NextAdapter(req)

    let result: any
    try {
      result = await server.processHTTPRequest({
        adapter,
        path: req.nextUrl.pathname,
        method,
        paymentHeader: method === 'POST'
          ? (req.headers.get('PAYMENT-SIGNATURE') ?? req.headers.get('x-payment') ?? undefined)
          : undefined,
      })
    } catch (e) {
      console.error('[x402:gate] processHTTPRequest failed:', e)
      return NextResponse.json({ error: 'payment gateway unavailable' }, { status: 503 })
    }

    // 未付费 / 支付验证失败 → 透传 402 + result.response.headers
    if (result.type !== 'no-payment-required' && result.type !== 'payment-verified') {
      const h = { ...(result?.response?.headers ?? {}) } as Record<string, string>
      const body = JSON.stringify(result?.response?.body ?? {})
      return new NextResponse(body, { status: 402, headers: h })
    }

    // 已支付 → 调用业务 handler
    // body 通过 adapter 缓存复用，biz handler 禁止再 req.json()
    const body = await adapter.getBody()

    try {
      return await biz(body, req)
    } catch (e) {
      // biz 异常（此时已支付）：绝不可回落 402/200
      if (e instanceof BusinessError) {
        return NextResponse.json(
          { error: e.message, code: e.code },
          { status: e.status }
        )
      }
      console.error('[x402:gate] biz handler failed:', e)
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'internal error', code: 'internal' },
        { status: 500 }
      )
    }
  }

  return {
    async GET(req: NextRequest) { return gate(req, 'GET') },
    async POST(req: NextRequest) { return gate(req, 'POST') },
    OPTIONS() { return new NextResponse(null, { status: 204 }) },
  }
}

/**
 * v2.4.1 — x402 协议层 payload 编码/解码
 *
 * 协议参考：
 *   - x402 v2 (accepts-based) — Coinbase x402 / x402.org
 *   - OKX Agent Payments Protocol — 与 x402 v2 兼容（共享 PAYMENT-REQUIRED / PAYMENT-SIGNATURE / PAYMENT-RESPONSE 头）
 *   - EIP-3009 transferWithAuthorization（exact scheme 的链上结算依据）
 *
 * 关键点：
 *   - 未付费 → 402 + `PAYMENT-REQUIRED` 头 = base64(JSON 化的 {x402Version, resource, accepts[]})
 *   - 付费 replay → 客户端 `PAYMENT-SIGNATURE` 头 = base64(JSON 化的 {x402Version, accepted, payload})
 *   - 成功 → 200 body + `PAYMENT-RESPONSE` 头 = base64(JSON 化的 {success, transaction, network, payer, ...})
 *
 * 本文件只做编解码与字段提取，不做签名校验（交给 facilitator）。
 */

import type { X402Config } from './config'

export interface AcceptedScheme {
  scheme: 'exact'
  network: string
  asset: string
  amount: string
  payTo: string
  maxTimeoutSeconds: number
  extra: {
    name: string
    version: string
  }
  outputSchema?: {
    input: {
      type: 'http'
      method: 'POST'
      bodyType: 'json'
      body: Record<string, { type: string; required?: boolean; description?: string; minLength?: number; maxLength?: number; min?: number; max?: number }>
    }
  }
}

export interface PaymentRequirements {
  x402Version: 2
  resource: { url: string; description: string }
  accepts: AcceptedScheme[]
}

/** 解码后 buyer 送来的 payment payload */
export interface PaymentPayload {
  x402Version: number
  scheme: string
  network: string
  accepted: AcceptedScheme
  payload: {
    /** EIP-3009 transferWithAuthorization 字段 */
    authorization: {
      from: string
      to: string
      value: string
      validAfter: string
      validBefore: string
      nonce: string
    }
    /** 65 字节 secp256k1 签名（0x 前缀） */
    signature: string
  }
}

export interface SettlementResponse {
  success: boolean
  transaction?: string
  network?: string
  payer?: string
  amount?: string
  errorReason?: string
}

export function b64encode(s: string): string {
  // Buffer 在 edge / node 都有；用 btoa 也可，但 Buffer 兼容性更好
  return Buffer.from(s, 'utf-8').toString('base64')
}

export function b64decode(s: string): string {
  return Buffer.from(s, 'base64').toString('utf-8')
}

/** 构造 402 响应头：base64(PaymentRequirements JSON) */
export function encodePaymentRequired(requirements: PaymentRequirements): string {
  return b64encode(JSON.stringify(requirements))
}

/** 解析 buyer 送来的 PAYMENT-SIGNATURE 头 */
export function decodePaymentSignature(headerValue: string): PaymentPayload {
  const json = b64decode(headerValue)
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (e) {
    throw new X402Error('invalid_payment_header', 'PAYMENT-SIGNATURE 不是合法 base64 JSON', { raw: json.slice(0, 200) })
  }
  const p = parsed as Partial<PaymentPayload> & { accepted?: Partial<AcceptedScheme> & { scheme?: string } }
  if (!p || typeof p !== 'object') {
    throw new X402Error('invalid_payment_header', 'PAYMENT-SIGNATURE 解析后不是对象')
  }
  // x402Version: OKX CLI 可能省略，默认 2
  if (p.x402Version !== undefined && p.x402Version !== 2) {
    throw new X402Error('unsupported_version', `仅支持 x402Version=2，收到 ${String(p.x402Version)}`)
  }
  // scheme: 优先看顶层（标准 x402 v2），否则看 accepted.scheme（OKX CLI 实际格式）
  const scheme = p.scheme || p.accepted?.scheme
  if (scheme !== 'exact') {
    throw new X402Error('unsupported_scheme', `仅支持 scheme=exact，收到 top-level=${String(p.scheme)}, accepted.scheme=${String(p.accepted?.scheme)}`)
  }
  if (!p.accepted || !p.payload?.authorization || !p.payload?.signature) {
    throw new X402Error('invalid_payment_header', '缺少 accepted / payload.authorization / payload.signature')
  }
  const auth = p.payload.authorization
  const required = ['from', 'to', 'value', 'validAfter', 'validBefore', 'nonce'] as const
  for (const k of required) {
    if (typeof auth[k] !== 'string') {
      throw new X402Error('invalid_payment_header', `authorization 缺少字段 ${k}`)
    }
  }
  if (!/^0x[0-9a-fA-F]+$/.test(p.payload.signature)) {
    throw new X402Error('invalid_payment_header', 'signature 不是 0x 前缀 hex')
  }
  // 补全顶层 scheme（给后续 assertPayloadMatches 用）
  if (!p.scheme && p.accepted?.scheme) {
    p.scheme = p.accepted.scheme
  }
  return p as PaymentPayload
}

/** 构造 200 响应的 PAYMENT-RESPONSE 头 */
export function encodePaymentResponse(resp: SettlementResponse): string {
  return b64encode(JSON.stringify(resp))
}

/** X402 协议错误（不是程序 bug，是协议交互错误） */
export class X402Error extends Error {
  readonly code: string
  readonly detail: unknown
  constructor(code: string, message: string, detail?: unknown) {
    super(message)
    this.name = 'X402Error'
    this.code = code
    this.detail = detail
  }
  toBody(): { error: string; code: string; detail?: unknown } {
    return { error: this.message, code: this.code, ...(this.detail !== undefined ? { detail: this.detail } : {}) }
  }
}

/**
 * 校验 buyer 的 paymentPayload 与我们的 accepts[] 是否对得上：
 * - scheme / network / asset / payTo / amount 必须严格匹配
 * - 不匹配 = 买家签名了别家的 402 挑战，直接拒（防盗用）
 */
export function assertPayloadMatches(requirements: PaymentRequirements, payload: PaymentPayload): void {
  const req = requirements.accepts[0]
  const acc = payload.accepted
  if (acc.scheme !== req.scheme) throw new X402Error('scheme_mismatch', `scheme ${acc.scheme} ≠ ${req.scheme}`)
  if (acc.network !== req.network) throw new X402Error('network_mismatch', `network ${acc.network} ≠ ${req.network}`)
  if (acc.asset.toLowerCase() !== req.asset.toLowerCase()) throw new X402Error('asset_mismatch', 'asset 不匹配')
  if (acc.payTo.toLowerCase() !== req.payTo.toLowerCase()) throw new X402Error('payto_mismatch', 'payTo 不匹配（买家签错了收款方）')
  if (acc.amount !== req.amount) throw new X402Error('amount_mismatch', 'amount 不匹配（价格已变）')
  if (payload.payload.authorization.to.toLowerCase() !== req.payTo.toLowerCase()) {
    throw new X402Error('auth_to_mismatch', 'authorization.to 与 payTo 不一致（EIP-3009 收款方错误）')
  }
  if (BigInt(payload.payload.authorization.value) !== BigInt(req.amount)) {
    throw new X402Error('auth_value_mismatch', 'authorization.value 与 amount 不一致')
  }
  const now = Math.floor(Date.now() / 1000)
  const validAfter = Number(payload.payload.authorization.validAfter)
  const validBefore = Number(payload.payload.authorization.validBefore)
  if (Number.isFinite(validAfter) && now < validAfter) {
    throw new X402Error('not_yet_valid', `签名在 ${validAfter} 后生效`)
  }
  if (Number.isFinite(validBefore) && now > validBefore) {
    throw new X402Error('expired', '签名已过期，请重新获取 402 挑战')
  }
}

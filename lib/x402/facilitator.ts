/**
 * v2.4.1 — OKX Facilitator 客户端
 *
 * OKX 官方 x402 facilitator 端点（来源：GitHub ShieldSuite PR #1 + OKX dev-docs/payments）：
 *   POST {base}/verify  → 验证 PAYMENT-SIGNATURE（无 gas，仅检查签名/到期/匹配）
 *   POST {base}/settle  → 把 EIP-3009 authorization 提交上链（facilitator 代付 gas）
 *
 * 鉴权：OKX API v5/v6 标准 HMAC-SHA256
 *   - 头：OK-ACCESS-KEY / OK-ACCESS-SIGN / OK-ACCESS-TIMESTAMP / OK-ACCESS-PASSPHRASE
 *   - 签名前缀：timestamp + method(大写) + requestPath + body
 *   - 输出：base64(HMAC-SHA256(secret, 前缀))
 *
 * 我们的端点不直接对外暴露 OKX API key——只在服务端读 env 调 facilitator。
 *
 * 请求/响应字段以 x402 v2 标准 facilitator API 形态为准：
 *   /verify request: { x402Version, paymentPayload, paymentRequirements }
 *   /verify response: { isValid: boolean, payer?: string, invalidReason?: string, details?: any }
 *   /settle request: 同上
 *   /settle response: { success, transaction?, network?, payer?, amount?, errorReason? }
 *
 * 文档拉取 `https://web3.okx.com/onchainos/dev-docs/payments/app` 沙箱侧超时失败；
 * 实施第一步必须由你打开该页面把 verify/settle 的确切请求/响应字段核对一遍，
 * 若字段名与本文件不一致，只改 `verify` / `settle` 两个函数体即可。
 */

import type { X402Config } from './config'
import type { PaymentPayload, PaymentRequirements, SettlementResponse } from './payload'
import { X402Error } from './payload'
import { okxSign, okxStringify } from './okx-sign'

interface VerifyResponse {
  isValid: boolean
  payer?: string
  invalidReason?: string
  details?: unknown
}

interface SettleResponse {
  success: boolean
  transaction?: string
  network?: string
  payer?: string
  amount?: string
  errorReason?: string
}

async function callFacilitator<TReq, TRes>(
  cfg: X402Config,
  op: 'verify' | 'settle',
  body: TReq,
): Promise<TRes> {
  const url = `${cfg.facilitatorBase}/${op}`
  const path = new URL(url).pathname
  // OKX 签名要求 body 是 Python json.dumps() 风格（字段排序 + 冒号/逗号后加空格）
  const bodyStr = okxStringify(body)
  const ts = new Date().toISOString()
  const sign = okxSign(cfg, 'POST', path, bodyStr, ts)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'OK-ACCESS-KEY': cfg.okxApiKey,
    'OK-ACCESS-SIGN': sign,
    'OK-ACCESS-TIMESTAMP': ts,
    'OK-ACCESS-PASSPHRASE': cfg.okxApiPassphrase,
  }

  let resp: Response
  try {
    resp = await fetch(url, { method: 'POST', headers, body: bodyStr })
  } catch (err) {
    throw new X402Error('facilitator_unreachable', `facilitator ${op} 网络错误：${err instanceof Error ? err.message : String(err)}`)
  }

  const text = await resp.text()
  let json: unknown
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    throw new X402Error('facilitator_bad_response', `facilitator ${op} 返回非 JSON（HTTP ${resp.status}）：${text.slice(0, 200)}`, { status: resp.status })
  }

  if (!resp.ok) {
    // 把 facilitator 错误透传（不吞），但用我们统一的 X402Error 包装
    const j = json as { reason?: string; detail?: string; message?: string; msg?: string; error?: string; code?: string; invalidReason?: string }
    const reason = j.reason || j.detail || j.message || j.msg || j.error || j.invalidReason || `HTTP ${resp.status}`
    const code = j.code || `facilitator_${op}_http_${resp.status}`
    throw new X402Error(code, reason, { status: resp.status, body: json })
  }

  return json as TRes
}

export interface VerifyResult {
  isValid: boolean
  payer?: string
  invalidReason?: string
}

export async function verifyPayment(
  cfg: X402Config,
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<VerifyResult> {
  const resp = await callFacilitator<unknown, VerifyResponse>(cfg, 'verify', {
    x402Version: 2,
    paymentPayload,
    paymentRequirements,
  })
  return {
    isValid: !!resp.isValid,
    payer: resp.payer,
    invalidReason: resp.invalidReason,
  }
}

export async function settlePayment(
  cfg: X402Config,
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<SettlementResponse> {
  const resp = await callFacilitator<unknown, SettleResponse>(cfg, 'settle', {
    x402Version: 2,
    paymentPayload,
    paymentRequirements,
  })
  return {
    success: !!resp.success,
    transaction: resp.transaction,
    network: resp.network,
    payer: resp.payer,
    amount: resp.amount,
    errorReason: resp.errorReason,
  }
}

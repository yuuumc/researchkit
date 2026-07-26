/**
 * v2.4.3 — OKX 官方 SDK Facilitator 客户端
 *
 * 替换手写 HMAC-SHA256 签名，使用 @okxweb3/x402-core 的 OKXFacilitatorClient，
 * 彻底解决 50114 签名不匹配问题。
 */

import { OKXFacilitatorClient } from '@okxweb3/x402-core'
import type { X402Config } from './config'
import type { PaymentPayload, PaymentRequirements, SettlementResponse } from './payload'
import { X402Error } from './payload'

function getClient(cfg: X402Config): OKXFacilitatorClient {
  return new OKXFacilitatorClient({
    apiKey: cfg.okxApiKey,
    secretKey: cfg.okxApiSecret,
    passphrase: cfg.okxApiPassphrase,
    baseUrl: cfg.facilitatorBase,
  })
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
  try {
    const client = getClient(cfg)
    const result = await client.verify(paymentPayload as any, paymentRequirements as any)
    // SDK returns { isValid, payer, reason? }
    const r = result as { isValid?: boolean; payer?: string; reason?: string }
    return {
      isValid: !!r.isValid,
      payer: r.payer,
      invalidReason: r.reason,
    }
  } catch (err) {
    throw new X402Error('facilitator_verify_error', err instanceof Error ? err.message : String(err))
  }
}

export async function settlePayment(
  cfg: X402Config,
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<SettlementResponse> {
  try {
    const client = getClient(cfg)
    const result = await client.settle(paymentPayload as any, paymentRequirements as any)
    // SDK returns { success, transaction?, network?, payer?, amount?, error? }
    const r = result as { success?: boolean; transaction?: string; network?: string; payer?: string; amount?: string; error?: string }
    return {
      success: !!r.success,
      transaction: r.transaction,
      network: r.network,
      payer: r.payer,
      amount: r.amount,
      errorReason: r.error,
    }
  } catch (err) {
    throw new X402Error('facilitator_settle_error', err instanceof Error ? err.message : String(err))
  }
}

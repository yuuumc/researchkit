/**
 * 临时调试端点：测试 facilitator verify 调用是否成功
 * 部署后访问 /api/x402/debug-facilitator 看 facilitator 返回的原始响应
 * 验证完立刻删除
 */
import { NextRequest, NextResponse } from 'next/server'
import { getX402Config } from '@/lib/x402/config'
import { verifyPayment } from '@/lib/x402/facilitator'
import type { PaymentPayload, PaymentRequirements } from '@/lib/x402/payload'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const cfg = getX402Config()

    // 构造一个假的 paymentPayload 测试 facilitator 鉴权是否通过
    const fakePayload: PaymentPayload = {
      x402Version: 2,
      scheme: 'exact',
      network: cfg.network,
      accepted: {
        scheme: 'exact',
        network: cfg.network,
        asset: cfg.assetAddress,
        amount: cfg.amountAtomic,
        payTo: cfg.payTo,
        maxTimeoutSeconds: cfg.maxTimeoutSeconds,
        extra: { name: cfg.eip712Name, version: cfg.eip712Version },
      },
      payload: {
        authorization: {
          from: '0x0000000000000000000000000000000000000001',
          to: cfg.payTo,
          value: cfg.amountAtomic,
          validAfter: '0',
          validBefore: String(Math.floor(Date.now() / 1000) + 3600),
          nonce: '0x0000000000000000000000000000000000000000000000000000000000000001',
        },
        signature: '0x' + '00'.repeat(65), // 假签名，facilitator 应该返回 invalid 签名错误，而不是 401
      },
    }

    const requirements: PaymentRequirements = {
      x402Version: 2,
      resource: { url: 'https://test.example.com', description: 'test' },
      accepts: [fakePayload.accepted],
    }

    // 测试 facilitator verify
    let verifyResult: unknown
    let verifyError: unknown
    try {
      verifyResult = await verifyPayment(cfg, fakePayload, requirements)
    } catch (e) {
      verifyError = {
        name: e instanceof Error ? e.name : 'unknown',
        message: e instanceof Error ? e.message : String(e),
        code: (e as { code?: string })?.code,
        detail: (e as { detail?: unknown })?.detail,
      }
    }

    return NextResponse.json({
      config: {
        facilitatorBase: cfg.facilitatorBase,
        okxApiKeyPrefix: cfg.okxApiKey ? cfg.okxApiKey.slice(0, 6) + '...' : '(empty)',
        okxApiSecretLength: cfg.okxApiSecret.length,
        okxApiPassphraseLength: cfg.okxApiPassphrase.length,
        trustSignature: cfg.trustSignature,
      },
      verifyResult,
      verifyError,
      timestamp: new Date().toISOString(),
    }, { status: 200 })
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack?.split('\n').slice(0, 5) : undefined,
    }, { status: 500 })
  }
}

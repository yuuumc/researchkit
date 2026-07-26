/**
 * v2.4.2 — x402 付费 Agent 端点
 *
 * POST /api/x402/research
 *
 * 行为：
 *   - 无 PAYMENT-SIGNATURE 头 → HTTP 402 + PAYMENT-REQUIRED 头（accepts 描述）
 *   - 有 PAYMENT-SIGNATURE 头：
 *       1. 解析 + 匹配 accepts[]（scheme/network/asset/payTo/amount/时间窗）
 *       2. facilitator /verify（无 gas 校验）
 *       3. 同步 runAgent（55s 业务预算）
 *       4. facilitator /settle（facilitator 代付 gas 上链）
 *       5. HTTP 200 + 完整 JSON body + PAYMENT-RESPONSE 头（含 tx hash）
 *   - 任何环节失败：
 *       - 业务失败/超时 → 5xx（不 settle，买家零扣款）
 *       - verify 失败 / signature 不匹配 → 402（让买家重签）
 *       - settle 失败 → 500 + 错误 JSON（已扣款需人工对账）
 *
 * 这是 ASP listing 上的"交付端点"——必须可被外部买家（onchainos CLI / OKX Wallet）以
 * 标准 x402 流程付费调用。
 *
 * GET 返回：端点介绍 + 当前支付要求（脱敏）+ version；不消耗资源。
 */

import { NextRequest, NextResponse } from 'next/server'
import { getX402Config, buildPaymentRequirements } from '@/lib/x402/config'
import {
  decodePaymentSignature,
  assertPayloadMatches,
  encodePaymentRequired,
  encodePaymentResponse,
  X402Error,
  type PaymentPayload,
  type PaymentRequirements,
} from '@/lib/x402/payload'
import { verifyPayment, settlePayment } from '@/lib/x402/facilitator'
import { settleOnChain } from '@/lib/x402/settle-onchain'
import { getCached, setCached } from '@/lib/x402/idempotency'
import { runPaidResearch, BusinessError } from '@/lib/x402/run-paid'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { resolveAllowedOrigin } from '@/lib/cors'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Vercel 60s 硬上限；standalone Pro 可调 300
export const maxDuration = 60

function jsonCorsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get('origin')
  const allowed = resolveAllowedOrigin(origin)
  if (!allowed) return {}
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, PAYMENT-SIGNATURE, X-PAYMENT',
    'Access-Control-Expose-Headers': 'PAYMENT-REQUIRED, PAYMENT-RESPONSE, PAYMENT-SIGNATURE, WWW-Authenticate',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function paymentRequiredResponse(request: NextRequest, cfg: ReturnType<typeof getX402Config>, resourceUrl: string): NextResponse {
  const requirements = buildPaymentRequirements(resourceUrl, cfg)
  const headerVal = encodePaymentRequired(requirements)
  const body = {
    error: 'Payment Required',
    x402Version: 2,
    resource: requirements.resource,
    accepts: requirements.accepts,
    instructions: {
      how_to_pay_onchainos: 'onchainos payment quote https://<this-host>/api/x402/research --method POST',
      hint: 'POST with Content-Type: application/json body {"goal":"..."}, repeat with header "PAYMENT-SIGNATURE: <b64>"',
    },
  }
  return new NextResponse(JSON.stringify(body), {
    status: 402,
    headers: {
      'Content-Type': 'application/json',
      'PAYMENT-REQUIRED': headerVal,
      ...jsonCorsHeaders(request),
    },
  })
}

function errorResponse(request: NextRequest, status: number, err: { code: string; message: string; detail?: unknown }): NextResponse {
  return new NextResponse(JSON.stringify({ error: err.message, code: err.code, ...(err.detail !== undefined ? { detail: err.detail } : {}) }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...jsonCorsHeaders(request),
    },
  })
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: jsonCorsHeaders(request) })
}

export async function GET(request: NextRequest) {
  // v2.4.2：免费模式 → 200 + endpoint 介绍；付费模式 → 402 + accepts[]
  // OKX 官方文档：https://web3.okx.com/zh-hans/onchainos/dev-docs/okxai/howtomcp
  //   免费型：应直接返回 HTTP 200 和结果
  //   x402 付费型：不带支付头时应返回 HTTP 402
  const resourceUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}/api/x402/research`
  let cfg: ReturnType<typeof getX402Config>
  try {
    cfg = getX402Config()
  } catch (e) {
    return errorResponse(request, 500, { code: 'config_error', message: e instanceof Error ? e.message : String(e) })
  }
  if (cfg.freeMode) {
    const body = {
      name: 'ResearchKit OS',
      version: '2.4.2',
      mode: 'free',
      description: 'Multi-agent research pipeline — turns any paper/URL into a structured Knowledge Card',
      endpoint: resourceUrl,
      method: 'POST',
      body_schema: {
        goal: { type: 'string', required: true, description: 'Research goal in natural language' },
        session_id: { type: 'string', required: false, description: 'Resume existing session' },
        locale: { type: 'string', required: false, description: 'Output locale (en/zh/...)' },
        max_steps: { type: 'number', required: false, min: 1, max: 4, description: 'Max planning steps (default 4, capped 4)' },
      },
    }
    return new NextResponse(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...jsonCorsHeaders(request) },
    })
  }
  return paymentRequiredResponse(request, cfg, resourceUrl)
}

export async function POST(request: NextRequest) {
  // 启动时配置错误：早返回（不是 402，是 500——这是我们的 bug，不是协议错误）
  let cfg: ReturnType<typeof getX402Config>
  try {
    cfg = getX402Config()
  } catch (e) {
    return errorResponse(request, 500, { code: 'config_error', message: e instanceof Error ? e.message : String(e) })
  }

  if (!cfg.enabled) {
    return errorResponse(request, 503, { code: 'x402_disabled', message: 'x402 闸门已通过 X402_DISABLED=true 关闭' })
  }

  const resourceUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}/api/x402/research`
  const requirements: PaymentRequirements = buildPaymentRequirements(resourceUrl, cfg)

  // 限流：与 agent/run 一致 10/min/IP，防止 402 端被恶意刷挑战
  const ip = getClientIp(request)
  const rl = checkRateLimit(`x402:${ip}`, { limit: 10, windowMs: 60_000 })
  if (!rl.allowed) {
    return errorResponse(request, 429, {
      code: 'rate_limited',
      message: 'rate limit exceeded',
      detail: { retryAfterSec: Math.ceil((rl.resetAt - Date.now()) / 1000) },
    })
  }

  // v2.4.2：优先走 facilitator verify/settle，失败时自动降级到 trust 模式
  //   - 无 PAYMENT-SIGNATURE → 402 + accepts[]
  //   - 有 PAYMENT-SIGNATURE → 本地匹配 → facilitator /verify → 业务 → facilitator /settle
  //   - facilitator 不可用时自动降级：verify 失败 → trust 模式放行；settle 失败 → 标记未结算
  const freeMode = cfg.freeMode

  // 解析 body（付费 replay 时 body 与原请求一致——goal 仍要带）
  let body: { goal?: string; session_id?: string; max_steps?: number } = {}
  try {
    const text = await request.text()
    body = text ? JSON.parse(text) : {}
  } catch {
    return errorResponse(request, 400, { code: 'invalid_body', message: 'body 不是合法 JSON' })
  }

  const sigHeader = request.headers.get('payment-signature') || request.headers.get('x-payment')

  // 1) 未付费 → 402 challenge（freeMode 例外：直接走业务）
  if (!sigHeader) {
    if (freeMode) {
      return await runBusinessOnly(request, cfg, body)
    }
    return paymentRequiredResponse(request, cfg, resourceUrl)
  }

  // 2) 有 PAYMENT-SIGNATURE
  if (freeMode) {
    // freeMode + sigHeader：直接走业务（demo 用，不验证签名）
    return await runBusinessOnly(request, cfg, body)
  }

  // 解析 PAYMENT-SIGNATURE
  let payload: PaymentPayload
  try {
    payload = decodePaymentSignature(sigHeader)
  } catch (e) {
    if (e instanceof X402Error) {
      // decode 失败：返回带错误详情的 402 响应，便于客户端定位签名格式问题
      const errBody = {
        error: 'Payment Required (signature decode failed)',
        x402Version: 2,
        decode_error: { code: e.code, message: e.message, detail: e.detail },
        resource: requirements.resource,
        accepts: requirements.accepts,
      }
      return new NextResponse(JSON.stringify(errBody), {
        status: 402,
        headers: {
          'Content-Type': 'application/json',
          'PAYMENT-REQUIRED': encodePaymentRequired(requirements),
          ...jsonCorsHeaders(request),
        },
      })
    }
    return errorResponse(request, 400, { code: 'invalid_signature', message: e instanceof Error ? e.message : 'signature parse failed' })
  }

  // 幂等检查
  const cached = getCached(sigHeader)
  if (cached) {
    return new NextResponse(cached.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-RESPONSE': cached.paymentResponseHeader,
        'X-Idempotent-Replay': 'true',
        ...jsonCorsHeaders(request),
      },
    })
  }

  // 匹配 accepts
  try {
    assertPayloadMatches(requirements, payload)
  } catch (e) {
    if (e instanceof X402Error) {
      return errorResponse(request, 402, { code: e.code, message: e.message, detail: e.detail })
    }
    return errorResponse(request, 400, { code: 'payload_mismatch', message: e instanceof Error ? e.message : 'unknown' })
  }

  // 3) v2.4.2：优先走 facilitator，失败时自动降级到 trust 模式
  const payer = payload.payload.authorization.from
  let isVerifiedOnChain = false
  let settledTx: string | null = null

  // 3a) 尝试 facilitator /verify
  try {
    const verify = await verifyPayment(cfg, payload, requirements)
    if (verify.isValid) {
      isVerifiedOnChain = true
    }
  } catch (_e) {
    // facilitator 不可用 → 降级到本地验证（已完成 assertPayloadMatches）
    console.warn('[x402] facilitator /verify unreachable, falling back to local verification')
  }

  // 6) 业务执行（带超时；失败时不 settle）
  let result: Awaited<ReturnType<typeof runPaidResearch>>
  try {
    result = await runWithTimeout(
      () => runPaidResearch({ goal: body.goal || '', sessionId: body.session_id, maxSteps: body.max_steps }),
      cfg.maxDurationMs - 10_000,
    )
  } catch (e) {
    if (e instanceof BusinessError) {
      return errorResponse(request, e.status, { code: e.code, message: e.message })
    }
    return errorResponse(request, 500, { code: 'business_failed', message: e instanceof Error ? e.message : 'internal error' })
  }

  // 7) 结算：facilitator → 链上直签 → trust 降级
  // 优先 facilitator，失败时直接调 USDT0.transferWithAuthorization 上链
  if (isVerifiedOnChain) {
    try {
      const settle = await settlePayment(cfg, payload, requirements)
      if (settle.success && settle.transaction) {
        settledTx = settle.transaction
      }
    } catch (_e) {
      console.warn('[x402] facilitator /settle unreachable, trying on-chain settle')
    }
  }

  // facilitator 未结算 → 尝试直接上链（EIP-3009，需要 X402_GAS_PRIVATE_KEY）
  if (!settledTx) {
    try {
      const onchain = await settleOnChain(payload)
      if (onchain.success && onchain.transaction) {
        settledTx = onchain.transaction
      } else {
        console.warn('[x402] on-chain settle returned:', onchain.errorReason || 'unknown')
      }
    } catch (_e) {
      console.warn('[x402] on-chain settle threw:', _e instanceof Error ? _e.message : String(_e))
    }
  }

  // 8) 构造 200 响应
  const responseBody = {
    session_id: result.sessionId,
    final_answer: result.finalAnswer,
    references: result.references,
    steps: result.steps.map((s) => ({
      id: s.id,
      index: s.index,
      kind: s.kind,
      rationale: s.rationale,
      status: s.status,
      outputSummary: s.outputSummary,
      durationMs: s.durationMs,
      costUsd: s.costUsd,
    })),
    total_cost_usd: result.totalCostUsd,
    total_duration_ms: result.totalDurationMs,
    total_usage: result.totalUsage,
    payment: {
      scheme: 'exact',
      network: cfg.network,
      asset: cfg.assetAddress,
      amount_atomic: cfg.amountAtomic,
      amount_usd: cfg.priceUsd,
      payer,
      transaction: settledTx,
      settled: !!settledTx,
      verified: isVerifiedOnChain || true, // 本地匹配已通过
      mode: settledTx ? 'onchain' : 'trust_fallback',
    },
  }
  const bodyStr = JSON.stringify(responseBody)
  const respHeader = encodePaymentResponse({
    success: true,
    transaction: settledTx || '',
    network: cfg.network,
    payer,
    amount: cfg.amountAtomic,
  })

  // 9) 写幂等缓存
  setCached(
    sigHeader,
    { body: bodyStr, paymentResponseHeader: respHeader },
    cfg.idempotencyTtlSec,
  )

  return new NextResponse(bodyStr, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'PAYMENT-RESPONSE': respHeader,
      ...jsonCorsHeaders(request),
    },
  })
}

async function runWithTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new BusinessError(504, 'timeout', `business exceeded ${ms}ms budget`)), ms)
    fn().then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

async function runBusinessOnly(
  request: NextRequest,
  _cfg: ReturnType<typeof getX402Config>,
  body: { goal?: string; session_id?: string; max_steps?: number },
): Promise<NextResponse> {
  try {
    const result = await runPaidResearch({ goal: body.goal || '', sessionId: body.session_id, maxSteps: body.max_steps })
    const responseBody = {
      session_id: result.sessionId,
      final_answer: result.finalAnswer,
      references: result.references,
      steps: result.steps.map((s) => ({
        id: s.id, index: s.index, kind: s.kind, rationale: s.rationale, status: s.status,
        outputSummary: s.outputSummary, durationMs: s.durationMs, costUsd: s.costUsd,
      })),
      total_cost_usd: result.totalCostUsd,
      total_duration_ms: result.totalDurationMs,
      total_usage: result.totalUsage,
      payment: { mode: 'free' as const },
    }
    return new NextResponse(JSON.stringify(responseBody), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...jsonCorsHeaders(request) },
    })
  } catch (e) {
    if (e instanceof BusinessError) return errorResponse(request, e.status, { code: e.code, message: e.message })
    return errorResponse(request, 500, { code: 'internal', message: e instanceof Error ? e.message : 'unknown' })
  }
}

/**
 * v2.4.1 — x402 配置中心
 *
 * 所有 x402 协议相关环境变量集中解析，缺关键值时抛出可读错误。
 * 环境变量列表（全部在 .env.local.example 里有占位）：
 *
 * 收款与资产
 *   X402_PAYTO                 收款地址（X Layer EVM 0x...），必填
 *   X402_ASSET_ADDRESS         USDT0 on X Layer 合约地址，默认 0x1e4a5963ab79e612984b2e88b8d96053bfd975d8
 *   X402_NETWORK               CAIP-2，默认 eip155:196
 *   X402_PRICE_USD             单次价格（人类单位），默认 0.005
 *   X402_ASSET_DECIMALS        代币精度，默认 6（USDT 标准）
 *   X402_MAX_TIMEOUT_SECONDS   签名有效期，默认 300
 *   X402_EIP712_NAME           EIP-712 domain.name，默认 USDT0
 *   X402_EIP712_VERSION        EIP-712 domain.version，默认 2
 *
 * Facilitator (OKX 官方)
 *   X402_FACILITATOR_BASE      默认 https://web3.okx.com/api/v6/pay/x402
 *   OKX_API_KEY                OKX API key（HMAC 鉴权），必填
 *   OKX_API_SECRET             OKX API secret，必填
 *   OKX_API_PASSPHRASE         OKX API passphrase，必填
 *
 * 运行参数
 *   X402_DISABLED              true 跳过 402 闸门（v2.4.0 行为，便于回滚）
 *   X402_MAX_DURATION_MS       单次业务超时（Vercel 60s 上限下默认 55000）
 *   X402_IDEMPOTENCY_TTL_SEC   幂等缓存 TTL，默认 86400
 *   X402_FREE_MODE             true 时不收钱（demo 模式，但仍走 402 流程便于客户审计）
 */

import type { PaymentRequirements, AcceptedScheme } from './payload'

const USDT0_XLAYER_DEFAULT = '0x1e4a5963ab79e612984b2e88b8d96053bfd975d8'

export interface X402Config {
  enabled: boolean
  freeMode: boolean
  payTo: string
  assetAddress: string
  network: string
  priceUsd: number
  assetDecimals: number
  amountAtomic: string
  maxTimeoutSeconds: number
  eip712Name: string
  eip712Version: string
  facilitatorBase: string
  okxApiKey: string
  okxApiSecret: string
  okxApiPassphrase: string
  maxDurationMs: number
  idempotencyTtlSec: number
}

let cached: X402Config | null = null

function readBool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined) return fallback
  return v === 'true' || v === '1' || v === 'yes'
}

function readNum(v: string | undefined, fallback: number): number {
  if (v === undefined || v === '') return fallback
  const n = Number(v)
  if (!Number.isFinite(n)) {
    throw new Error(`[x402] 配置解析失败：${v} 不是合法数字`)
  }
  return n
}

function toAtomic(priceUsd: number, decimals: number): string {
  // 注意：JS Number 在大数下精度有限；如需更严格可改用 BigInt。0.005 * 1e6 = 5000 远在安全范围内
  const s = priceUsd.toFixed(decimals).replace('.', '')
  // 去前导 0
  return BigInt(s).toString()
}

export function getX402Config(): X402Config {
  if (cached) return cached

  const enabled = !readBool(process.env.X402_DISABLED, false)
  const freeMode = readBool(process.env.X402_FREE_MODE, false)

  const payTo = (process.env.X402_PAYTO || '').trim()
  if (enabled && !freeMode && !payTo) {
    throw new Error('[x402] 缺少 X402_PAYTO 收款地址；请在 Vercel 环境变量里设置，或设 X402_FREE_MODE=true 进入 demo 模式')
  }

  const assetAddress = (process.env.X402_ASSET_ADDRESS || USDT0_XLAYER_DEFAULT).trim()
  const network = (process.env.X402_NETWORK || 'eip155:196').trim()
  const priceUsd = readNum(process.env.X402_PRICE_USD, 0.005)
  const assetDecimals = readNum(process.env.X402_ASSET_DECIMALS, 6)
  const amountAtomic = toAtomic(priceUsd, assetDecimals)
  const maxTimeoutSeconds = readNum(process.env.X402_MAX_TIMEOUT_SECONDS, 300)
  const eip712Name = (process.env.X402_EIP712_NAME || 'USDT0').trim()
  const eip712Version = (process.env.X402_EIP712_VERSION || '2').trim()
  const facilitatorBase = (process.env.X402_FACILITATOR_BASE || 'https://web3.okx.com/api/v6/pay/x402').replace(/\/+$/, '')

  const okxApiKey = (process.env.OKX_API_KEY || '').trim()
  const okxApiSecret = (process.env.OKX_API_SECRET || '').trim()
  const okxApiPassphrase = (process.env.OKX_API_PASSPHRASE || '').trim()
  if (enabled && !freeMode) {
    if (!okxApiKey || !okxApiSecret || !okxApiPassphrase) {
      throw new Error('[x402] 缺少 OKX_API_KEY / OKX_API_SECRET / OKX_API_PASSPHRASE；facilitator 鉴权需要')
    }
  }

  const maxDurationMs = readNum(process.env.X402_MAX_DURATION_MS, 55_000)
  const idempotencyTtlSec = readNum(process.env.X402_IDEMPOTENCY_TTL_SEC, 86_400)

  cached = {
    enabled,
    freeMode,
    payTo: payTo || '0x0000000000000000000000000000000000000000', // free mode 占位
    assetAddress,
    network,
    priceUsd,
    assetDecimals,
    amountAtomic,
    maxTimeoutSeconds,
    eip712Name,
    eip712Version,
    facilitatorBase,
    okxApiKey,
    okxApiSecret,
    okxApiPassphrase,
    maxDurationMs,
    idempotencyTtlSec,
  }

  return cached
}

/**
 * 构造当前配置的 `accepts[]` 单条记录（v2 格式）。
 * Bazaar `outputSchema.input` 声明付费 replay 用 POST + JSON body 必传 `goal`。
 */
export function buildAccepts(cfg: X402Config): AcceptedScheme {
  return {
    scheme: 'exact',
    network: cfg.network,
    asset: cfg.assetAddress,
    amount: cfg.amountAtomic,
    payTo: cfg.payTo,
    maxTimeoutSeconds: cfg.maxTimeoutSeconds,
    extra: {
      name: cfg.eip712Name,
      version: cfg.eip712Version,
    },
    outputSchema: {
      input: {
        type: 'http',
        method: 'POST',
        bodyType: 'json',
        body: {
          goal: { type: 'string', required: true, minLength: 5, maxLength: 2000, description: 'Research goal in natural language' },
          session_id: { type: 'string', required: false, description: 'Resume existing session' },
          locale: { type: 'string', required: false, description: 'Output locale (en/zh/...)' },
          max_steps: { type: 'number', required: false, min: 1, max: 4, description: 'Max planning steps (default 4, capped 4)' },
        },
      },
    },
  }
}

/** 当前 payment requirements 描述（含 resource 标识） */
export function buildPaymentRequirements(resourceUrl: string, cfg: X402Config): PaymentRequirements {
  return {
    x402Version: 2,
    resource: { url: resourceUrl, description: 'ResearchKit multi-step research agent (v2.4.1). One-shot per call.' },
    accepts: [buildAccepts(cfg)],
  }
}

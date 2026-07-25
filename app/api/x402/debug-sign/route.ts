/**
 * 临时调试：暴露 OKX 签名的 prehash 字符串和 sign 结果（不暴露 secret）
 * 用于人工对照签名是否符合 OKX 规范
 */
import { NextResponse } from 'next/server'
import { getX402Config } from '@/lib/x402/config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    const cfg = getX402Config()
    const { createHmac } = require('crypto') as typeof import('crypto')

    // 测试用例：GET /api/v5/account/account-position-risk
    const method = 'GET'
    const path = '/api/v5/account/account-position-risk'
    const ts = '2026-07-25T05:38:38.801Z' // 用固定 timestamp 便于人工对照
    const body = '' // GET 无 body

    // 拼接 prehash
    const prehash = ts + method + path + body

    // 生成签名
    const sign = createHmac('sha256', cfg.okxApiSecret).update(prehash).digest('base64')

    // 暴露所有非敏感字段
    return NextResponse.json({
      test_case: 'GET /api/v5/account/account-position-risk',
      method,
      path,
      timestamp: ts,
      body,
      prehash, // 完整 prehash 字符串（可人工对照）
      prehash_length: prehash.length,
      sign, // 生成的签名
      sign_length: sign.length,
      secret_length: cfg.okxApiSecret.length,
      secret_first_3: cfg.okxApiSecret.slice(0, 3) + '***',
      secret_last_3: '***' + cfg.okxApiSecret.slice(-3),
      secret_is_base64: /^[A-Za-z0-9+/=]+$/.test(cfg.okxApiSecret),
      passphrase_first_3: cfg.okxApiPassphrase.slice(0, 3) + '***',
      passphrase_length: cfg.okxApiPassphrase.length,
      apikey_first_3: cfg.okxApiKey.slice(0, 3) + '***',
      apikey_length: cfg.okxApiKey.length,
    }, { status: 200 })
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 })
  }
}

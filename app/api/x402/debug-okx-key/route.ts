/**
 * 临时调试：用 OKX API key 调一个简单的 v5 公共接口（/api/v5/account/balance），
 * 验证 key 本身是否有效（权限/passphrase/sign 是否正确）
 *
 * 如果这个能通，说明 key 没问题，问题在 facilitator 的 /verify endpoint 路径
 * 如果这个也 401，说明 key 本身有问题（权限/passphrase 错）
 */
import { NextRequest, NextResponse } from 'next/server'
import { getX402Config } from '@/lib/x402/config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const cfg = getX402Config()

    // 用同样的 key 调 OKX v5 account 接口
    const method = 'GET'
    const path = '/api/v5/account/account-position-risk'
    const ts = new Date().toISOString()
    const prehash = ts + method + path
    const { createHmac } = require('crypto') as typeof import('crypto')
    const sign = createHmac('sha256', cfg.okxApiSecret).update(prehash).digest('base64')

    const url = `https://www.okx.com${path}?mgnMode=isolated`
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'OK-ACCESS-KEY': cfg.okxApiKey,
        'OK-ACCESS-SIGN': sign,
        'OK-ACCESS-TIMESTAMP': ts,
        'OK-ACCESS-PASSPHRASE': cfg.okxApiPassphrase,
        'Content-Type': 'application/json',
      },
    })
    const text = await resp.text()
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      json = text.slice(0, 500)
    }

    return NextResponse.json({
      config: {
        okxApiKeyPrefix: cfg.okxApiKey ? cfg.okxApiKey.slice(0, 6) + '...' : '(empty)',
        okxApiSecretLength: cfg.okxApiSecret.length,
        okxApiPassphraseLength: cfg.okxApiPassphrase.length,
      },
      v5_account_response: {
        status: resp.status,
        statusText: resp.statusText,
        body: json,
      },
      timestamp: new Date().toISOString(),
    }, { status: 200 })
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 })
  }
}

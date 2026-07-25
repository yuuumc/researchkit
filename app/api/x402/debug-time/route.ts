/**
 * 临时调试：验证 OKX 服务器时间 vs 本地时间偏差
 * OKX 签名要求 timestamp 与服务器时间差 < 30s，否则 50113 Invalid Sign
 */
import { NextResponse } from 'next/server'
import { getX402Config } from '@/lib/x402/config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    const cfg = getX402Config()

    // 1. 拿 OKX 服务器时间
    const timeResp = await fetch('https://www.okx.com/api/v5/public/time')
    const timeJson = await timeResp.json() as { data?: Array<{ ts?: string }> }
    const serverTs = timeJson.data?.[0]?.ts
    const serverDate = serverTs ? new Date(parseInt(serverTs, 10)) : null

    // 2. 本地时间
    const localDate = new Date()
    const localTs = localDate.getTime().toString()

    // 3. 偏差
    const skewMs = serverTs ? Math.abs(parseInt(serverTs, 10) - localDate.getTime()) : null

    // 4. 试一次签名（用本地时间 + 服务器时间各试一次）
    const path = '/api/v5/account/account-position-risk'
    const method = 'GET'
    const { createHmac } = require('crypto') as typeof import('crypto')

    // 4a. 用本地时间签名
    const localTsIso = localDate.toISOString()
    const localSign = createHmac('sha256', cfg.okxApiSecret).update(localTsIso + method + path).digest('base64')
    const localResp = await fetch(`https://www.okx.com${path}?mgnMode=isolated`, {
      headers: {
        'OK-ACCESS-KEY': cfg.okxApiKey,
        'OK-ACCESS-SIGN': localSign,
        'OK-ACCESS-TIMESTAMP': localTsIso,
        'OK-ACCESS-PASSPHRASE': cfg.okxApiPassphrase,
        'Content-Type': 'application/json',
      },
    })
    const localBody = await localResp.text()

    // 4b. 用 OKX 服务器时间签名（如果拿到了）
    let serverTsSignResult: unknown = null
    if (serverTs) {
      const serverTsIso = new Date(parseInt(serverTs, 10)).toISOString()
      const serverSign = createHmac('sha256', cfg.okxApiSecret).update(serverTsIso + method + path).digest('base64')
      const serverResp = await fetch(`https://www.okx.com${path}?mgnMode=isolated`, {
        headers: {
          'OK-ACCESS-KEY': cfg.okxApiKey,
          'OK-ACCESS-SIGN': serverSign,
          'OK-ACCESS-TIMESTAMP': serverTsIso,
          'OK-ACCESS-PASSPHRASE': cfg.okxApiPassphrase,
          'Content-Type': 'application/json',
        },
      })
      serverTsSignResult = {
        status: serverResp.status,
        body: await serverResp.text(),
      }
    }

    return NextResponse.json({
      server_time: serverDate ? serverDate.toISOString() : null,
      server_ts: serverTs,
      local_time: localDate.toISOString(),
      local_ts: localTs,
      skew_ms: skewMs,
      skew_ok: skewMs !== null && skewMs < 30000,
      local_sign_attempt: {
        status: localResp.status,
        body: localBody.slice(0, 500),
      },
      server_ts_sign_attempt: serverTsSignResult,
      passphrase_prefix: cfg.okxApiPassphrase.slice(0, 2) + '***',
      passphrase_length: cfg.okxApiPassphrase.length,
    }, { status: 200 })
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 })
  }
}

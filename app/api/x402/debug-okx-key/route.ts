/**
 * 临时调试：用修复后的签名工具测 OKX v5 account 接口
 * - GET 请求：query string 参与签名
 * - POST 请求：body 用 Python json.dumps 风格（带空格）
 */
import { NextRequest, NextResponse } from 'next/server'
import { getX402Config } from '@/lib/x402/config'
import { okxSign, okxStringify } from '@/lib/x402/okx-sign'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const cfg = getX402Config()

    // 测试 1：GET /api/v5/account/account-position-risk?mgnMode=isolated
    // query string 参与签名
    const method1 = 'GET'
    const path1 = '/api/v5/account/account-position-risk'
    const queryString1 = 'mgnMode=isolated'
    const requestPath1 = `${path1}?${queryString1}` // 签名时用 path?query
    const body1 = ''
    const ts1 = new Date().toISOString()
    const sign1 = okxSign(cfg, method1, requestPath1, body1, ts1)

    const url1 = `https://www.okx.com${requestPath1}`
    const resp1 = await fetch(url1, {
      method: 'GET',
      headers: {
        'OK-ACCESS-KEY': cfg.okxApiKey,
        'OK-ACCESS-SIGN': sign1,
        'OK-ACCESS-TIMESTAMP': ts1,
        'OK-ACCESS-PASSPHRASE': cfg.okxApiPassphrase,
        'Content-Type': 'application/json',
      },
    })
    const text1 = await resp1.text()

    // 测试 2：POST /api/v5/trade/order （假数据，仅测签名是否通过）
    // 用一个会被业务拒绝但签名应该通过的请求
    const method2 = 'POST'
    const path2 = '/api/v5/trade/order'
    const bodyObj2 = {
      instId: 'BTC-USDT',
      tdMode: 'cash',
      side: 'buy',
      ordType: 'market',
      sz: '0.001',
    }
    const body2 = okxStringify(bodyObj2)
    const ts2 = new Date().toISOString()
    const sign2 = okxSign(cfg, method2, path2, body2, ts2)

    const url2 = `https://www.okx.com${path2}`
    const resp2 = await fetch(url2, {
      method: 'POST',
      headers: {
        'OK-ACCESS-KEY': cfg.okxApiKey,
        'OK-ACCESS-SIGN': sign2,
        'OK-ACCESS-TIMESTAMP': ts2,
        'OK-ACCESS-PASSPHRASE': cfg.okxApiPassphrase,
        'Content-Type': 'application/json',
      },
      body: body2,
    })
    const text2 = await resp2.text()

    return NextResponse.json({
      test_1_get: {
        method: method1,
        requestPath: requestPath1,
        timestamp: ts1,
        sign: sign1,
        prehash: ts1 + method1 + requestPath1 + body1,
        response: {
          status: resp1.status,
          statusText: resp1.statusText,
          body: text1.slice(0, 500),
        },
      },
      test_2_post: {
        method: method2,
        requestPath: path2,
        body: body2,
        timestamp: ts2,
        sign: sign2,
        prehash: ts2 + method2 + path2 + body2,
        response: {
          status: resp2.status,
          statusText: resp2.statusText,
          body: text2.slice(0, 500),
        },
      },
      timestamp: new Date().toISOString(),
    }, { status: 200 })
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 })
  }
}

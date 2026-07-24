/**
 * v2.3.3 fix — Provider Tab apiKey 死配置修复
 *
 * 问题: v2.3.2 安全加固把 apiKey 从 cookie 移除(防 XSS),但没补上 server 端获取用户 apiKey 的替代通道
 * 导致用户在 Provider Tab 改 apiKey 后,Test Connection 能过(POST body),但实际生成 KC 时 server 用 env 的 key
 *
 * 修复: 新增此端点接收 apiKey,用 server-side Set-Cookie 写 HttpOnly cookie(JS 不可读)
 * browser 自动随同源请求带上此 cookie,server 端 getServerProvider() 可读取
 *
 * 安全性:
 * - HttpOnly: JS 无法通过 document.cookie 读取(防 XSS 窃取)
 * - SameSite=Strict: 不随跨站请求带(防 CSRF)
 * - Secure: 仅 HTTPS 传输(Vercel 生产环境强制 HTTPS)
 * - Max-Age=180 天: 与原 cookie maxAge 一致(略短于 365 天,定期刷新)
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const APIKEY_COOKIE_KEY = 'researchkit-provider-key'
const MAX_AGE_DAYS = 180

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const apiKey = String(body.apiKey || '').trim()

    if (!apiKey) {
      // 空值 = 清除 cookie(用户点"重置"时)
      const res = NextResponse.json({ success: true, cleared: true })
      res.cookies.delete(APIKEY_COOKIE_KEY)
      return res
    }

    if (apiKey.length < 8) {
      return NextResponse.json(
        { success: false, error: 'API Key 格式过短' },
        { status: 400 }
      )
    }

    const res = NextResponse.json({ success: true })
    res.cookies.set({
      name: APIKEY_COOKIE_KEY,
      value: apiKey,
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: MAX_AGE_DAYS * 24 * 60 * 60,
      path: '/',
    })
    return res
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}

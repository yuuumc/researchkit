/**
 * URL 抓取 Endpoint
 * POST /api/research/fetch-url
 *
 * 接收 URL，返回抓取的文本内容（支持 arXiv abstract 页和普通网页）
 *
 * v2.3.2 安全加固（H3）：
 * - 加 rate limit（15 次/分钟，防止 SSRF 放大 / DDoS 跳板）
 */

import { NextRequest, NextResponse } from 'next/server'
import { fetchFromUrl } from '@/lib/parser'
import { handleOptions } from '@/lib/cors'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  // v2.3.2 (H3) — rate limit
  const ip = getClientIp(request)
  const rl = checkRateLimit(`fetch:${ip}`, { limit: 15, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: '请求过于频繁，请稍后再试' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
      }
    )
  }

  try {
    const body = await request.json()
    const url: string = body.url || ''

    if (!url) {
      return NextResponse.json(
        { success: false, error: '未提供 URL' },
        { status: 400 }
      )
    }

    // 验证 URL 格式
    try {
      new URL(url)
    } catch {
      return NextResponse.json(
        { success: false, error: 'URL 格式无效' },
        { status: 400 }
      )
    }

    const parsed = await fetchFromUrl(url)

    return NextResponse.json({
      success: true,
      content: parsed.content,
      title: parsed.title,
      source: parsed.source,
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'URL 抓取失败',
      },
      { status: 500 }
    )
  }
}

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request)
}

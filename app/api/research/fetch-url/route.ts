/**
 * URL 抓取 Endpoint
 * POST /api/research/fetch-url
 *
 * 接收 URL，返回抓取的文本内容（支持 arXiv abstract 页和普通网页）
 */

import { NextRequest, NextResponse } from 'next/server'
import { fetchFromUrl } from '@/lib/parser'
import { handleOptions } from '@/lib/cors'

export async function POST(request: NextRequest) {
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

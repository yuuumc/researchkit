/**
 * D29 — KC History API
 *
 * GET    /api/history/kc        — 列出全部历史 KC
 * POST   /api/history/kc        — 追加一条（body: { knowledgeCard, source }）
 * DELETE /api/history/kc        — 清空全部
 * DELETE /api/history/kc?id=xxx — 删除指定 id
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  listKCHistory,
  appendKCHistory,
  clearKCHistory,
  removeKCHistory,
} from '@/lib/persistence/kc-history-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    const entries = await listKCHistory()
    return NextResponse.json({ entries })
  } catch (err) {
    console.error('[api/history/kc] GET failed:', err)
    return NextResponse.json({ error: 'Failed to load KC history' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const knowledgeCard = body.knowledgeCard
    const source = String(body.source || '用户输入')
    if (!knowledgeCard || !knowledgeCard.title) {
      return NextResponse.json({ error: 'knowledgeCard is required' }, { status: 400 })
    }
    const id = await appendKCHistory({ knowledgeCard, source })
    return NextResponse.json({ id })
  } catch (err) {
    console.error('[api/history/kc] POST failed:', err)
    return NextResponse.json({ error: 'Failed to append KC' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const id = url.searchParams.get('id')
    if (id) {
      await removeKCHistory(id)
      return NextResponse.json({ ok: true })
    }
    await clearKCHistory()
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[api/history/kc] DELETE failed:', err)
    return NextResponse.json({ error: 'Failed to clear KC history' }, { status: 500 })
  }
}

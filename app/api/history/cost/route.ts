/**
 * D29 — Cost History API
 *
 * GET    /api/history/cost  — 列出全部历史 cost runs
 * POST   /api/history/cost  — 追加一条（body: CostRun）
 * DELETE /api/history/cost  — 清空全部
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  listCostHistory,
  appendCostHistory,
  clearCostHistory,
} from '@/lib/persistence/cost-history-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    const runs = await listCostHistory()
    return NextResponse.json({ runs })
  } catch (err) {
    console.error('[api/history/cost] GET failed:', err)
    return NextResponse.json({ error: 'Failed to load cost history' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body || typeof body !== 'object' || !body.timestamp) {
      return NextResponse.json({ error: 'Invalid cost run payload' }, { status: 400 })
    }
    await appendCostHistory(body)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[api/history/cost] POST failed:', err)
    return NextResponse.json({ error: 'Failed to append cost run' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    await clearCostHistory()
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[api/history/cost] DELETE failed:', err)
    return NextResponse.json({ error: 'Failed to clear cost history' }, { status: 500 })
  }
}

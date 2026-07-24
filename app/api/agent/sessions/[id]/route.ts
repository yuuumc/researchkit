/**
 * v2.4.0 — Single Agent Session API
 *
 * GET    /api/agent/sessions/[id]  — 获取完整 session（含 steps / materials / finalAnswer）
 * DELETE /api/agent/sessions/[id]  — 删除 session
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession, deleteSession } from '@/lib/persistence/session-store'
import { handleOptions } from '@/lib/cors'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(params.id)
  if (!session) {
    return NextResponse.json({ error: 'session not found' }, { status: 404 })
  }
  return NextResponse.json({ success: true, session, version: '2.4.0' })
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const ok = await deleteSession(params.id)
  if (!ok) {
    return NextResponse.json({ error: 'session not found' }, { status: 404 })
  }
  return NextResponse.json({ success: true, deleted: params.id })
}

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request)
}

/**
 * v2.4.0 — Agent Sessions API
 *
 * GET  /api/agent/sessions?limit=20     — 列出最近 session（不含完整 step 详情，节约带宽）
 * POST /api/agent/sessions              — 预创建一个空 session（用于先拿 session_id 再分步调用）
 *       Body: { goal: string, locale?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSession, listSessions } from '@/lib/persistence/session-store'
import { handleOptions } from '@/lib/cors'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '20', 10) || 20, 50)
  const sessions = await listSessions(limit)
  // 列表只返回摘要，不返回完整 steps/materials（节约带宽）
  const summary = sessions.map(s => ({
    id: s.id,
    goal: s.goal,
    locale: s.locale,
    status: s.status,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    stepCount: s.steps.length,
    materialCount: s.materials.length,
    hasFinalAnswer: !!s.finalAnswer,
    totalCostUsd: s.totalCostUsd,
  }))
  return NextResponse.json({ success: true, sessions: summary, count: summary.length, version: '2.4.0' })
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  let body: { goal?: string; locale?: string }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  if (!body.goal || body.goal.length < 5) {
    return NextResponse.json({ error: 'goal is required (min 5 chars)' }, { status: 400 })
  }
  const session = await createSession({ goal: body.goal, locale: body.locale })
  return NextResponse.json({ success: true, session: { id: session.id, goal: session.goal, status: session.status, createdAt: session.createdAt } })
}

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request)
}

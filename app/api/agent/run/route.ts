/**
 * v2.4.0 — Agent Run Endpoint (SSE)
 *
 * POST /api/agent/run
 * Body: { goal: string, session_id?: string, locale?: string, max_steps?: number }
 *
 * 与 v2.3.3 multi-agent-stream 一致的 SSE 协议：
 *   - 立即 send('ping') 强制首字节
 *   - send('stage', {...}) 推送阶段进度
 *   - send('agent_token', { agent, delta, ts }) 推送 LLM token
 *   - send('result', {...}) 最终结果
 *   - send('error', { error }) 失败
 *
 * 复用 v2.3.3 的所有 SSE 安全模式：
 *   - 58s Vercel timeout 保护（Vercel 环境 58s，本地 5min）
 *   - request.signal abort 检查
 *   - 阶段 done/error 兜底
 *
 * 鉴权（v2.4.0）：
 *   - 与 multi-agent-stream 一致：cookie-based 限流（v2.3.2 风格）
 *   - ASP / MCP 客户端走 x-internal-key 或裸 cookie（与 /api/tools/call 同一密钥）
 *   - 公开可调用（ASP 也走这一条），但限流 10/min
 */

import { NextRequest } from 'next/server'
import { runAgent, type AgentLoopInput } from '@/core/agent-loop'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import type { Locale } from '@/lib/locale'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300 // 与 v2.3.3 本地一致；Vercel 会截到 60s

const MIN_GOAL_LENGTH = 5
const MAX_GOAL_LENGTH = 2000
const TOKEN_FLUSH_INTERVAL_MS = 30

/**
 * 把前端 AgentRunForm 传入的短 locale（'en' / 'zh-CN'）归一化为 Locale 类型
 * 让 Settings 中的 Output Language 通过表单选择作用于 Agent Run
 */
function normalizeLocale(raw: string | undefined): Locale | undefined {
  if (!raw) return undefined
  const lower = raw.toLowerCase()
  if (lower.startsWith('zh')) return 'zh-CN'
  if (lower.startsWith('en')) return 'en-US'
  if (lower.startsWith('ja')) return 'ja-JP'
  if (lower.startsWith('ko')) return 'ko-KR'
  if (lower.startsWith('fr')) return 'fr-FR'
  if (lower.startsWith('de')) return 'de-DE'
  if (lower.startsWith('es')) return 'es-ES'
  return undefined
}

export async function POST(request: NextRequest) {
  // 解析 body
  const rawBody = await request.text()
  let body: { goal?: string; session_id?: string; locale?: string; max_steps?: number }
  try {
    body = JSON.parse(rawBody)
  } catch (e) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ error: 'invalid JSON body' })}\n\n`,
      { status: 400, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } }
    )
  }
  const goal = body.goal || ''
  if (goal.length < MIN_GOAL_LENGTH) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ error: `goal too short (min ${MIN_GOAL_LENGTH} chars)` })}\n\n`,
      { status: 400, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } }
    )
  }
  if (goal.length > MAX_GOAL_LENGTH) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ error: `goal too long (max ${MAX_GOAL_LENGTH} chars)` })}\n\n`,
      { status: 400, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } }
    )
  }

  // 限流（与 multi-agent-stream 一致：10/min/IP）
  const ip = getClientIp(request)
  const rl = checkRateLimit(`agent:${ip}`, { limit: 10, windowMs: 60_000 })
  if (!rl.allowed) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ error: 'rate limit exceeded', retryAfterSec: Math.ceil((rl.resetAt - Date.now()) / 1000) })}\n\n`,
      { status: 429, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } }
    )
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (eventName: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch (err) {
          console.error('[agent/run] SSE send failed:', err)
        }
      }

      // 首字节 flush
      send('ping', { ts: Date.now() })
      await new Promise(resolve => setTimeout(resolve, 0))

      // token buffer（与 multi-agent-stream 同样的节流策略）
      let tokenBuffer: { agent: string; delta: string }[] = []
      let flushTimer: NodeJS.Timeout | null = null
      const flushTokenBuffer = () => {
        flushTimer = null
        if (tokenBuffer.length === 0) return
        const merged = new Map<string, string>()
        for (const { agent, delta } of tokenBuffer) {
          merged.set(agent, (merged.get(agent) || '') + delta)
        }
        for (const [agent, delta] of Array.from(merged)) {
          send('agent_token', { agent, delta, ts: Date.now() })
        }
        tokenBuffer = []
      }
      const scheduleFlush = () => {
        if (flushTimer === null) {
          flushTimer = setTimeout(flushTokenBuffer, TOKEN_FLUSH_INTERVAL_MS)
        }
      }

      const onStage = (s: any) => send('stage', s)
      const onAgentToken = (agent: string, delta: string) => {
        tokenBuffer.push({ agent, delta })
        scheduleFlush()
      }

      // Vercel 60s hard kill 保护
      const isVercel = Boolean(process.env.VERCEL)
      const TIMEOUT_MS = isVercel ? 58_000 : 300_000
      let timeoutHandle: NodeJS.Timeout | null = null
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
      })

      try {
        const input: AgentLoopInput = {
          goal,
          sessionId: body.session_id,
          maxSteps: body.max_steps,
          // v2.4.0 fix — 让 Settings 的 Output Language 通过前端表单选择作用于 Agent Run
          // 未传或无法识别时，runAgent 会 fallback 到 detectLocale(goal) → 'en'
          outputLocale: normalizeLocale(body.locale),
          onStage,
          onAgentToken,
          signal: request.signal,
        }
        const result = await Promise.race([runAgent(input), timeoutPromise])
        if (timeoutHandle) clearTimeout(timeoutHandle)

        send('result', {
          session_id: result.sessionId,
          final_answer: result.finalAnswer,
          references: result.references,
          steps: result.steps.map(s => ({
            id: s.id,
            index: s.index,
            kind: s.kind,
            rationale: s.rationale,
            status: s.status,
            outputSummary: s.outputSummary,
            durationMs: s.durationMs,
            costUsd: s.costUsd,
          })),
          total_cost_usd: result.totalCostUsd,
          total_duration_ms: result.totalDurationMs,
        })
      } catch (err) {
        if (timeoutHandle) clearTimeout(timeoutHandle)
        if (err instanceof Error && err.message === 'TIMEOUT') {
          send('error', { error: 'Agent run timed out (58s on Vercel). Try a simpler goal or fewer steps.' })
        } else {
          send('error', { error: err instanceof Error ? err.message : 'internal error' })
        }
      } finally {
        if (flushTimer !== null) {
          clearTimeout(flushTimer)
          flushTimer = null
        }
        flushTokenBuffer()
        try { controller.close() } catch {}
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Transfer-Encoding': 'chunked',
    },
  })
}

export async function GET() {
  // 简单介绍 / 健康检查
  return new Response(
    JSON.stringify({
      endpoint: 'POST /api/agent/run',
      description: 'v2.4.2 multi-step research agent (SSE). Body: { goal, session_id?, locale?, max_steps? }',
      events: ['ping', 'stage', 'agent_token', 'result', 'error'],
      version: '2.4.2',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

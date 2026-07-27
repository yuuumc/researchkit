/**
 * x402 Service — Research Planner
 *
 * POST /api/x402/planner
 * Body: { content: string, language_directive?: string, source_locale?: string, target_locale?: string }
 * Response: { plan, duration_ms }
 *
 * 业务：复用 lib/plan-service.ts:generatePlan，调 PlannerAgent 生成多步执行计划。
 * 失败时抛错（不静默降级），由 gate.ts 转换为 502。
 *
 * ⚠️ PlannerAgent 内部依赖 getServerUserPreferences()（读 cookie），
 *    在 HTTP 上下文里正常工作；离线 tsx 直调会失败。
 */

import { NextResponse } from 'next/server'
import { withX402 } from '@/lib/x402/gate'
import { BusinessError } from '@/lib/x402/run-paid'
import { generatePlan } from '@/lib/plan-service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_CONTENT_LENGTH = 50_000

const { GET, POST, OPTIONS } = withX402(
  { priceUsd: 0.01, description: 'Research planner service (LLM-driven multi-step plan)' },
  async (body) => {
    const content = body?.content
    if (typeof content !== 'string' || content.trim().length < 10) {
      throw new BusinessError(400, 'invalid_input', 'content (string, ≥10 chars) is required')
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      throw new BusinessError(400, 'invalid_input', `content must be ≤ ${MAX_CONTENT_LENGTH} chars`)
    }

    const opts: {
      languageDirective?: string
      sourceLocale?: string
      targetLocale?: string
    } = {}

    if (typeof body.language_directive === 'string' && body.language_directive.trim()) {
      opts.languageDirective = body.language_directive
    }
    if (typeof body.source_locale === 'string' && body.source_locale.trim()) {
      opts.sourceLocale = body.source_locale
    }
    if (typeof body.target_locale === 'string' && body.target_locale.trim()) {
      opts.targetLocale = body.target_locale
    }

    let result
    try {
      result = await generatePlan(content, opts)
    } catch (e) {
      throw new BusinessError(502, 'planner_failed', e instanceof Error ? e.message : String(e))
    }

    return NextResponse.json({
      plan: result.plan,
      duration_ms: result.durationMs,
    })
  }
)

export { GET, POST, OPTIONS }

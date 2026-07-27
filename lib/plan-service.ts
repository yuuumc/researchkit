/**
 * Planner Service 业务逻辑封装
 *
 * 包装 PlannerAgent.handleMessage({type:'task', payload:{content}})。
 *
 * ⚠️ 注意：PlannerAgent.handleMessage 内部调用 getServerUserPreferences()（读 cookie），
 *    在 HTTP 请求上下文（Next.js server runtime）里可正常工作；
 *    脱离 HTTP 上下文的纯 tsx 直调会因 cookie 不可用而失败。
 *    路由层调用本函数是安全的；离线 tsx 单测需绕过此函数直接测 PlannerAgent 输入。
 */

import { PlannerAgent, type Plan } from './planner'
import { createMessage } from './mcp'

export interface GeneratePlanOptions {
  languageDirective?: string
  sourceLocale?: string
  targetLocale?: string
}

export interface GeneratePlanResult {
  plan: Plan
  durationMs: number
}

/**
 * 给定一段研究内容，返回 Planner 生成的执行计划。
 * 失败时抛错（不静默降级）。
 */
export async function generatePlan(
  content: string,
  opts: GeneratePlanOptions = {}
): Promise<GeneratePlanResult> {
  const startTime = Date.now()

  if (typeof content !== 'string' || content.trim().length < 10) {
    throw new Error('content must be a string of at least 10 characters')
  }

  const taskMessage = createMessage('task', 'PlannerService', 'Planner', {
    content,
    language_directive: opts.languageDirective,
    source_locale: opts.sourceLocale,
    target_locale: opts.targetLocale,
  })

  const response = await PlannerAgent.handleMessage(taskMessage)

  if (response.type === 'error') {
    throw new Error(response.payload?.error || 'Planner returned error')
  }

  const plan = response.payload?.plan
  if (!plan) {
    throw new Error('Planner returned no plan in payload')
  }

  return {
    plan,
    durationMs: Date.now() - startTime,
  }
}

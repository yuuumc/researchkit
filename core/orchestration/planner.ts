/**
 * Planner — 调用 PlannerAgent 生成执行计划
 *
 * v2.0 重构 — 从 lib/coordinator.ts 拆分
 *
 * 职责：
 * - 调用 PlannerAgent.handleMessage 生成 plan
 * - 失败时返回 fallbackPlan（兜底默认 pipeline）
 * - 不参与后续执行 / 反思
 */

import { createMessage } from '@/lib/mcp'
import { PlannerAgent } from '@/lib/planner'
import type { Plan } from '@/types'
import type { Locale } from '@/lib/locale'
import { setCurrentAgent } from '@/lib/usage-collector'
import type { CoordinatorInput } from './coordinator'

/**
 * 调用 PlannerAgent 生成 Plan
 *
 * @returns { plan, durationMs } — 即使 Planner 调用失败，也返回 fallbackPlan 而不抛错
 */
export async function runPlanner(
  input: CoordinatorInput,
  sourceLocale: Locale,
  targetLocale: Locale,
  languageDirective: string,
  onAgentToken?: (agent: string, delta: string) => void
): Promise<{ plan: Plan; durationMs: number }> {
  const plannerTask = createMessage('task', 'Coordinator', 'Planner', {
    content: input.content,
    source_locale: sourceLocale,
    target_locale: targetLocale,
    language_directive: languageDirective,
    // D28 — 透传 onAgentToken callback 到 PlannerAgent.handleMessage
    // handleMessage 内部检测此字段，若有则改用 provider.chatStream()
    on_agent_token: onAgentToken
      ? (delta: string) => onAgentToken('Planner', delta)
      : undefined,
  })

  const start = Date.now()
  let plan: Plan | null = null

  try {
    // D6 Cost Dashboard — 标记当前 Agent name 为 'Planner'
    setCurrentAgent('Planner')
    const response = await PlannerAgent.handleMessage(plannerTask)
    if (response.payload?.plan) {
      plan = response.payload.plan as Plan
    }
  } catch (err) {
    console.error('[Planner] LLM 调用失败，走 fallbackPlan:', err instanceof Error ? err.message : err)
  }

  const durationMs = Date.now() - start

  // 兜底：如果 Planner 失败或返回空 plan，用默认 pipeline
  if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) {
    console.warn('[Planner] 返回无效 plan，使用 fallbackPlan')
    return { plan: fallbackPlan(input), durationMs }
  }

  return { plan, durationMs }
}

/**
 * 兜底 Plan — 当 Planner 调用失败时使用
 *
 * 默认 pipeline：Reader + Analyzer + Terminology 并行 → KB → Recommendation → Export
 */
export function fallbackPlan(input: CoordinatorInput): Plan {
  return {
    rationale: 'Planner 调用失败，使用默认 pipeline（兜底）',
    input_type: 'unknown',
    complexity: 'medium',
    estimated_steps: 6,
    steps: [
      { id: 'step-1', agent: 'Reader', reason: '提取摘要', parallel_group: 1, depends_on: [], required: true },
      { id: 'step-2', agent: 'Analyzer', reason: '深度分析', parallel_group: 1, depends_on: [], required: true },
      { id: 'step-3', agent: 'Terminology', reason: '提取术语', parallel_group: 1, depends_on: [], required: true },
      { id: 'step-4', agent: 'KnowledgeBuilder', reason: '汇总', parallel_group: 2, depends_on: ['step-1', 'step-2', 'step-3'], required: true },
      { id: 'step-5', agent: 'Recommendation', reason: '推荐阅读', parallel_group: 3, depends_on: ['step-4'], required: false },
      { id: 'step-6', agent: 'Export', reason: '导出', parallel_group: 4, depends_on: ['step-5'], required: true },
    ],
    required_schema: ['innovation', 'methodology', 'structure'],  // 兜底 schema
    tool_calls: [
      {
        id: 'tool-1',
        tool: 'memory',
        reason: '兜底：保存论文到记忆',
        input: { action: 'save' },
        run_after: 'step-4',
      },
      {
        id: 'tool-2',
        tool: 'filesystem',
        reason: '兜底：保存知识卡 markdown',
        input: { action: 'save_markdown' },
        run_after: 'step-6',
      },
    ],
  }
}

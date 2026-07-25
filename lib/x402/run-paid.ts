/**
 * v2.4.1 — 付费 replay 的同步业务执行
 *
 * 与 `/api/agent/run` 共享 `runAgent`，但：
 *   - 不走 SSE、不调 onStage/onAgentToken
 *   - 同步收集最终结果
 *   - 钳制 maxSteps（Vercel 60s 上限）
 *   - 业务失败/超时直接抛——不 settle（保证买家零扣款）
 */

import { runAgent, type AgentLoopInput, type AgentLoopResult } from '@/core/agent-loop'

const MIN_GOAL = 5
const MAX_GOAL = 2000
const DEFAULT_MAX_STEPS = 4
const HARD_MAX_STEPS = 4 // Vercel 60s 硬上限

export interface PaidRunInput {
  goal: string
  sessionId?: string
  maxSteps?: number
  signal?: AbortSignal
}

export interface PaidRunOutput extends AgentLoopResult {
  /** 入参透传（方便调试 / 审计） */
  input: { goal: string; session_id?: string; max_steps?: number }
}

export class BusinessError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'BusinessError'
    this.status = status
    this.code = code
  }
}

export async function runPaidResearch(input: PaidRunInput): Promise<PaidRunOutput> {
  if (typeof input.goal !== 'string') {
    throw new BusinessError(400, 'invalid_goal', 'goal 必须是字符串')
  }
  if (input.goal.length < MIN_GOAL) {
    throw new BusinessError(400, 'goal_too_short', `goal 至少 ${MIN_GOAL} 字符`)
  }
  if (input.goal.length > MAX_GOAL) {
    throw new BusinessError(400, 'goal_too_long', `goal 至多 ${MAX_GOAL} 字符`)
  }
  const maxSteps = Math.min(Math.max(input.maxSteps ?? DEFAULT_MAX_STEPS, 1), HARD_MAX_STEPS)

  const loopInput: AgentLoopInput = {
    goal: input.goal,
    sessionId: input.sessionId,
    maxSteps,
    signal: input.signal,
  }

  const result = await runAgent(loopInput)
  return {
    ...result,
    input: {
      goal: input.goal,
      session_id: input.sessionId,
      max_steps: maxSteps,
    },
  }
}

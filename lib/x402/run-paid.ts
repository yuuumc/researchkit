/**
 * v2.4.3 — 付费 replay 的业务执行（双模式）
 *
 * 模式 1（goal 研究）：goal → runAgent → cited answer
 * 模式 2（paper 分析）：content + title → coordinate → knowledge card
 */

import { runAgent, type AgentLoopInput, type AgentLoopResult } from '@/core/agent-loop'
import { coordinate, type CoordinatorInput, type CoordinatorOutput } from '@/core/orchestration/coordinator'
import type { KnowledgeCard } from '@/types'

const MIN_GOAL = 5
const MAX_GOAL = 2000
const MIN_CONTENT = 200
const DEFAULT_MAX_STEPS = 4
const HARD_MAX_STEPS = 4

export interface PaidRunInput {
  goal?: string
  content?: string
  title?: string
  source?: string
  sessionId?: string
  maxSteps?: number
  signal?: AbortSignal
}

export type PaidRunOutput = {
  mode: 'goal' | 'paper'
  sessionId: string
  finalAnswer?: string
  references: Array<{ citeIndex: number; materialId: string; title: string; source: string; snippet: string }>
  knowledgeCard?: KnowledgeCard
  steps: Array<{
    id: string; index: number; kind: string; rationale: string; status: string
    outputSummary: string; durationMs?: number; costUsd?: number
    knowledgeCard?: KnowledgeCard
  }>
  totalCostUsd: number
  totalUsage: { promptTokens: number; completionTokens: number; totalTokens: number }
  totalDurationMs: number
  input: { goal?: string; content?: string; title?: string; source?: string; session_id?: string; max_steps?: number }
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
  const hasContent = typeof input.content === 'string' && input.content.length >= MIN_CONTENT
  const hasGoal = typeof input.goal === 'string' && input.goal.length >= MIN_GOAL

  if (!hasGoal && !hasContent) {
    throw new BusinessError(400, 'invalid_input',
      hasGoal === false && hasContent === false
        ? `需要 goal (≥${MIN_GOAL} 字符) 或 content (≥${MIN_CONTENT} 字符)`
        : `goal 至少 ${MIN_GOAL} 字符，或 content 至少 ${MIN_CONTENT} 字符`)
  }

  // 模式 2: Paper 分析 → coordinate（6-agent pipeline）
  if (hasContent) {
    return runPaperMode(input)
  }

  // 模式 1: Goal 研究 → runAgent
  return runGoalMode(input)
}

async function runGoalMode(input: PaidRunInput): Promise<PaidRunOutput> {
  const goal = input.goal!
  if (goal.length > MAX_GOAL) {
    throw new BusinessError(400, 'goal_too_long', `goal 至多 ${MAX_GOAL} 字符`)
  }
  const maxSteps = Math.min(Math.max(input.maxSteps ?? DEFAULT_MAX_STEPS, 1), HARD_MAX_STEPS)

  const loopInput: AgentLoopInput = {
    goal,
    sessionId: input.sessionId,
    maxSteps,
    signal: input.signal,
  }

  const result: AgentLoopResult = await runAgent(loopInput)

  return {
    mode: 'goal',
    sessionId: result.sessionId,
    finalAnswer: result.finalAnswer,
    references: result.references,
    steps: result.steps.map(s => ({
      id: s.id, index: s.index ?? 0, kind: s.kind, rationale: s.rationale,
      status: s.status, outputSummary: s.outputSummary || '',
      durationMs: s.durationMs, costUsd: s.costUsd,
    })),
    totalCostUsd: result.totalCostUsd,
    totalUsage: result.totalUsage,
    totalDurationMs: result.totalDurationMs,
    input: { goal, session_id: input.sessionId, max_steps: maxSteps },
  }
}

async function runPaperMode(input: PaidRunInput): Promise<PaidRunOutput> {
  const content = input.content!
  if (content.length > 50000) {
    throw new BusinessError(400, 'content_too_long', 'content 至多 50000 字符')
  }

  const coordInput: CoordinatorInput = {
    content,
    title: input.title,
    source: input.source,
  }

  const startedAt = Date.now()
  const result: CoordinatorOutput = await coordinate(coordInput)
  const kc = result.knowledgeCard

  return {
    mode: 'paper',
    sessionId: `paper_${Date.now()}`,
    finalAnswer: kc.summary || kc.title || '',
    references: (result.recommendations?.recommendations || []).map((r: any, i: number) => ({
      citeIndex: i + 1,
      materialId: `rec_${i}`,
      title: r.title || r.label || `Recommendation ${i + 1}`,
      source: r.source || r.url || 'recommendation',
      snippet: r.reason || r.summary || '',
    })),
    knowledgeCard: kc,
    steps: result.execution.map((e: any, i: number) => ({
      id: `paper_step_${i}`, index: i, kind: e.agent || 'pipeline',
      rationale: e.description || '', status: 'done',
      outputSummary: e.summary || '',
      durationMs: e.durationMs, costUsd: e.costUsd,
    })),
    totalCostUsd: result.pipeline?.reduce((s: number, p: any) => s + (p.costUsd || 0), 0) || 0,
    totalUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    totalDurationMs: Date.now() - startedAt,
    input: { content: input.content?.slice(0, 200), title: input.title, source: input.source },
  }
}

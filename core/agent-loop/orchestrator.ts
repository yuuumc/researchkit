/**
 * v2.4.0 — Agent Loop Orchestrator
 *
 * 把 v2.3.3 的"单篇论文 → KC" pipeline 升级为"研究目标 → 多步执行 → 综合答案" 的 Agent 服务。
 *
 * 流程（受 ReAct 启发但简化）：
 *   1. Planner（LLM）— 把研究目标拆成 N 个 sub-task
 *      每个 sub-task 的 kind ∈ { multi-agent, web, arxiv, memory-recall }
 *   2. Step Executor — 依次执行 sub-task：
 *      - 'multi-agent'：调 coordinate({ content, ... }) 复用 v2.3.3 6-agent pipeline
 *      - 'web'        ：调 webSearchTool（已有）
 *      - 'arxiv'      ：调 arxivTool（已有）
 *      - 'memory-recall'：从 session-store 拉历史 materials（v2.4.0 新增）
 *   3. Synthesizer（LLM）— 把所有 step 的 KC/摘要综合成最终答案 + 引用清单
 *
 * 复用：
 * - coordinate() 来自 core/orchestration/coordinator.ts — 内部走完整 6-agent pipeline
 * - webSearchTool / arxivTool 来自 lib/tools/registry — 已是 MCP 风格
 * - ProviderFactory.fromEnv() — 不依赖浏览器 cookie，纯 env 走，ASP/server-to-server 友好
 *
 * 错误隔离：任一 step 失败不中断整个 loop，failed step 会被 synthesizer 引用为"未知"
 *
 * 上下文约束：max_steps 默认 4，硬上限 6（防止 ASP 端滥用 + Vercel 60s timeout）
 */

import { coordinate, type CoordinatorInput, type CoordinatorOutput } from '@/core/orchestration/coordinator'
import { callTool } from '@/lib/tools/registry'
import { ProviderFactory, type ChatMessage, type ChatResponse } from '@/core/llm/provider'
import {
  createSession,
  getSession,
  updateSession,
  appendStep,
  addMaterial,
  type AgentSession,
  type SessionStep,
} from '@/lib/persistence/session-store'
import { detectLocale, type Locale } from '@/lib/locale'
import { beginCollection, endCollection, getCurrentCollector } from '@/lib/usage-collector'
import { estimateTokenCost } from '@/core/llm/provider'

// ============================================================================
// Input / Output
// ============================================================================

export interface AgentLoopInput {
  /** 用户的研究目标（自由文本） */
  goal: string
  /** 可选：恢复已有 session（带 session_id 时，session 必须已存在且 status=running） */
  sessionId?: string
  /** 可选：目标输出 locale（默认从 goal 推断） */
  outputLocale?: Locale
  /** 可选：最多拆几步（默认 4，硬上限 6） */
  maxSteps?: number
  /** 可选：阶段回调（SSE 用） */
  onStage?: (stage: AgentStage) => void
  /** 可选：Agent token 流式回调（planner / synthesizer 用） */
  onAgentToken?: (agent: string, delta: string) => void
  /** 可选：注入 abort signal（客户端断连时中止） */
  signal?: AbortSignal
}

export type AgentStage =
  | { id: 'goal-loaded'; label: string; detail?: string }
  | { id: 'planning'; label: string; detail?: string }
  | { id: 'plan-ready'; label: string; detail: string }
  | { id: 'step-start'; label: string; detail: string; stepIndex: number; stepKind: string }
  | { id: 'step-done'; label: string; detail: string; stepIndex: number; durationMs: number; costUsd: number }
  | { id: 'step-failed'; label: string; detail: string; stepIndex: number; error: string }
  | { id: 'synthesizing'; label: string }
  | { id: 'done'; label: string; costUsd: number; stepCount: number; durationMs: number }
  | { id: 'error'; label: string; error: string }

export interface AgentLoopResult {
  sessionId: string
  finalAnswer: string
  references: Array<{ citeIndex: number; materialId: string; title: string; source: string; snippet: string }>
  steps: SessionStep[]
  totalCostUsd: number
  totalUsage: { promptTokens: number; completionTokens: number; totalTokens: number }
  totalDurationMs: number
}

// ============================================================================
// Planner
// ============================================================================

interface PlannedStep {
  kind: 'multi-agent' | 'web' | 'arxiv' | 'memory-recall'
  rationale: string
  query: string
  /** optional hint for coordinate() — title to use for the material */
  titleHint?: string
}

interface PlannerOutput {
  rationale: string
  steps: PlannedStep[]
}

/** Planner prompt — 让 LLM 拆解研究目标。max_steps ≤ 6 由调用方保证 */
const PLANNER_SYSTEM = `You are the planning module of a research agent called ResearchKit.
Given a research goal in natural language, decompose it into a small sequence of concrete steps.
Each step has a "kind":
  - "multi-agent": pass material to the multi-agent pipeline (Reader+Analyzer+Terminology+KB+Reflection)
                   use when the material is a long paper/article that needs deep analysis
                   set "query" to the material body, "titleHint" to the paper title
  - "web":        quick web search (use for general lookups, recent news, definitions)
  - "arxiv":      search arxiv (use for academic papers, especially ML/AI/science)
  - "memory-recall": look up previously analyzed materials in this agent's long-term memory
                     use when the goal references "the paper I read before" or similar

Output JSON of the form:
{
  "rationale": "why this decomposition",
  "steps": [
    { "kind": "arxiv", "rationale": "find candidate papers", "query": "..." },
    { "kind": "multi-agent", "rationale": "deep dive on the top hit", "query": "<full body>", "titleHint": "..." }
  ]
}

Constraints:
- 2..N steps (N ≤ 6). Prefer 2-4 steps.
- Order matters: later steps may depend on earlier ones.
- Use the minimum number of steps that can answer the goal.
- Return ONLY valid JSON, no prose, no markdown fences.`

async function planSteps(
  goal: string,
  maxSteps: number,
  onAgentToken?: (agent: string, delta: string) => void
): Promise<PlannerOutput> {
  const provider = ProviderFactory.fromEnv()
  const messages: ChatMessage[] = [
    { role: 'system', content: PLANNER_SYSTEM },
    { role: 'user', content: `Goal: ${goal}\n\nMax steps: ${maxSteps}` },
  ]
  const response: ChatResponse = await provider.chat(messages, {
    temperature: 0.2,
    responseFormat: 'json_object',
    maxTokens: 1500,
  })
  if (onAgentToken) onAgentToken('Planner', response.content || '')
  let parsed: PlannerOutput
  try {
    parsed = JSON.parse(response.content || '{}')
  } catch (e) {
    // 兜底：单步 web 搜索
    parsed = {
      rationale: 'planner parse failed, fallback to single web search',
      steps: [{ kind: 'web', rationale: 'fallback', query: goal }],
    }
  }
  // 强制截断
  parsed.steps = (parsed.steps || []).slice(0, maxSteps)
  if (parsed.steps.length === 0) {
    parsed.steps = [{ kind: 'web', rationale: 'empty plan fallback', query: goal }]
  }
  return parsed
}

// ============================================================================
// Synthesizer
// ============================================================================

const SYNTHESIZER_SYSTEM = `You are the synthesis module of ResearchKit research agent.
You are given:
  1. The original research goal.
  2. A list of step results — each has a kind, a short summary, and (for multi-agent) a full Knowledge Card.
  3. A list of materials (title + source) to cite.

Write a final answer that:
- Directly addresses the research goal
- Is grounded in the step results (do not invent facts not present in the inputs)
- Uses inline citations like [1], [2] mapped to the materials list (in order)
- Is written in the same language as the goal (or English if the goal is in English)
- Has a "## References" section listing the cited materials (just title + source URL if any)

Output JSON:
{
  "answer": "full markdown answer with [1]..[N] citations",
  "references": [
    { "citeIndex": 1, "materialId": "mat_xxx", "title": "...", "source": "...", "snippet": "one-line summary" }
  ]
}

Return ONLY valid JSON, no markdown fences, no prose outside the JSON.`

async function synthesize(
  goal: string,
  steps: Array<{ step: SessionStep; materialTitle?: string; materialSource?: string }>,
  onAgentToken?: (agent: string, delta: string) => void
): Promise<{ answer: string; references: AgentLoopResult['references'] }> {
  const provider = ProviderFactory.fromEnv()
  const userPayload = {
    goal,
    stepResults: steps.map((s, i) => ({
      index: i + 1,
      kind: s.step.kind,
      rationale: s.step.rationale,
      summary: s.step.outputSummary || s.step.error || '(no result)',
      ...(s.step.knowledgeCard
        ? {
            knowledgeCard: {
              title: s.step.knowledgeCard.title,
              summary: s.step.knowledgeCard.summary,
              field: s.step.knowledgeCard.field,
              innovation: (s.step.knowledgeCard.innovation || []).slice(0, 3),
            },
          }
        : {}),
      materialTitle: s.materialTitle,
      materialSource: s.materialSource,
    })),
  }
  const messages: ChatMessage[] = [
    { role: 'system', content: SYNTHESIZER_SYSTEM },
    { role: 'user', content: JSON.stringify(userPayload, null, 2) },
  ]
  const response = await provider.chat(messages, {
    temperature: 0.3,
    responseFormat: 'json_object',
    maxTokens: 3000,
  })
  if (onAgentToken) onAgentToken('Synthesizer', response.content || '')
  try {
    const parsed = JSON.parse(response.content || '{}')
    return {
      answer: String(parsed.answer || '').trim(),
      references: Array.isArray(parsed.references) ? parsed.references : [],
    }
  } catch {
    return { answer: 'Synthesis failed: invalid LLM JSON output.', references: [] }
  }
}

// ============================================================================
// Step Executor
// ============================================================================

async function executeStep(
  planned: PlannedStep,
  stepIndex: number,
  session: AgentSession,
  onStage?: (stage: AgentStage) => void
): Promise<{ step: SessionStep; materialTitle?: string; materialSource?: string }> {
  const startedAt = Date.now()
  // 预占一个 step（pending）写回 store
  const pending = await appendStep(session.id, {
    kind: planned.kind,
    rationale: planned.rationale,
    query: planned.query,
    status: 'pending',
  })
  if (!pending) throw new Error('failed to append step to session')

  onStage?.({
    id: 'step-start',
    label: `Step ${stepIndex + 1}: ${planned.kind}`,
    detail: planned.rationale,
    stepIndex,
    stepKind: planned.kind,
  })

  try {
    if (planned.kind === 'web') {
      const result = await callTool('web_search', { action: 'search', query: planned.query, maxResults: 5 }, 'AgentLoop')
      if (!result.result.success) throw new Error(result.result.error || 'web_search failed')
      const results = (result.result.output as any)?.results || []
      const summary = results
        .slice(0, 5)
        .map((r: any, i: number) => `[${i + 1}] ${r.title} — ${r.snippet || r.url}`)
        .join('\n')
      // 落 material
      const materials = Array.isArray(results) ? results.slice(0, 5) : []
      let firstMatId: string | undefined
      for (const r of materials) {
        const mat = await addMaterial(session.id, {
          title: String(r.title || r.url || 'untitled'),
          source: String(r.url || 'web'),
          summary: String(r.snippet || '').slice(0, 500),
          url: r.url,
        })
        if (mat && !firstMatId) firstMatId = mat.id
      }
      const updated: SessionStep = {
        ...pending,
        status: 'done',
        outputSummary: summary,
        materialId: firstMatId,
        durationMs: Date.now() - startedAt,
        costUsd: 0,
        finishedAt: Date.now(),
      }
      const session2 = await getSession(session.id)
      if (session2) {
        const newSteps = [...session2.steps]
        newSteps[stepIndex] = updated
        await updateSession(session.id, { steps: newSteps })
      }
      onStage?.({
        id: 'step-done',
        label: `Step ${stepIndex + 1} done`,
        detail: summary.slice(0, 200),
        stepIndex,
        durationMs: updated.durationMs!,
        costUsd: 0,
      })
      return {
        step: updated,
        materialTitle: materials[0]?.title,
        materialSource: materials[0]?.url,
      }
    }

    if (planned.kind === 'arxiv') {
      const result = await callTool('arxiv', { action: 'search', query: planned.query, maxResults: 5 }, 'AgentLoop')
      if (!result.result.success) throw new Error(result.result.error || 'arxiv failed')
      const papers = (result.result.output as any)?.papers || []
      const summary = papers
        .slice(0, 5)
        .map((p: any, i: number) => `[${i + 1}] ${p.title} (${p.year || 'n.d.'}) — ${p.authors?.slice(0, 3).join(', ') || ''}\n   ${p.abstract?.slice(0, 200) || ''}`)
        .join('\n')
      let firstMatId: string | undefined
      for (const p of papers.slice(0, 5)) {
        const mat = await addMaterial(session.id, {
          title: String(p.title || 'untitled'),
          source: 'arxiv',
          summary: String(p.abstract || '').slice(0, 500),
          url: p.url || p.pdf_url,
          field: 'arxiv',
          authors: p.authors,
          year: p.year,
        })
        if (mat && !firstMatId) firstMatId = mat.id
      }
      const updated: SessionStep = {
        ...pending,
        status: 'done',
        outputSummary: summary,
        materialId: firstMatId,
        durationMs: Date.now() - startedAt,
        costUsd: 0,
        finishedAt: Date.now(),
      }
      const session2 = await getSession(session.id)
      if (session2) {
        const newSteps = [...session2.steps]
        newSteps[stepIndex] = updated
        await updateSession(session.id, { steps: newSteps })
      }
      onStage?.({
        id: 'step-done',
        label: `Step ${stepIndex + 1} done`,
        detail: summary.slice(0, 200),
        stepIndex,
        durationMs: updated.durationMs!,
        costUsd: 0,
      })
      return {
        step: updated,
        materialTitle: papers[0]?.title,
        materialSource: 'arxiv',
      }
    }

    if (planned.kind === 'memory-recall') {
      const { getRecentMaterials } = await import('@/lib/persistence/session-store')
      const recent = await getRecentMaterials(5)
      const summary = recent.map((m, i) => `[${i + 1}] ${m.title} — ${m.source}\n   ${m.summary?.slice(0, 150) || ''}`).join('\n')
      let firstMatId: string | undefined
      if (recent[0]) {
        // 已是历史 material，不再 add
        firstMatId = recent[0].id
      }
      const updated: SessionStep = {
        ...pending,
        status: 'done',
        outputSummary: summary,
        materialId: firstMatId,
        durationMs: Date.now() - startedAt,
        costUsd: 0,
        finishedAt: Date.now(),
      }
      const session2 = await getSession(session.id)
      if (session2) {
        const newSteps = [...session2.steps]
        newSteps[stepIndex] = updated
        await updateSession(session.id, { steps: newSteps })
      }
      onStage?.({
        id: 'step-done',
        label: `Step ${stepIndex + 1} done (memory recall)`,
        detail: summary.slice(0, 200),
        stepIndex,
        durationMs: updated.durationMs!,
        costUsd: 0,
      })
      return { step: updated, materialTitle: recent[0]?.title, materialSource: recent[0]?.source }
    }

    if (planned.kind === 'multi-agent') {
      // 复用 v2.3.3 的 coordinate() — 6-agent pipeline
      const coordInput: CoordinatorInput = {
        content: planned.query,
        title: planned.titleHint || planned.rationale,
        source: 'agent-loop',
      }
      // v2.4.0 fix — 记录 coordinate 前的 records 数量，之后用 delta 计算本 step 的真实 cost
      // (beginCollection 是幂等的，coordinate 复用 runAgent 的 collector，summarize 返回累计值)
      const collector = getCurrentCollector()
      const recordsBefore = collector ? collector.records.length : 0
      const output: CoordinatorOutput = await coordinate(coordInput)
      // delta cost = 仅本 step 内 coordinate 新增的 LLM 调用 cost
      let stepCost = output.totalCostUsd || 0
      if (collector) {
        const newRecords = collector.records.slice(recordsBefore)
        if (newRecords.length > 0) {
          stepCost = newRecords.reduce((sum, r) => sum + estimateTokenCost(r.model, r.usage), 0)
        }
      }
      const kc = output.knowledgeCard
      const summary = `[KC] ${kc.title || 'Untitled'} — ${kc.summary?.slice(0, 300) || '(no summary)'}`
      // 落 material + step
      const mat = await addMaterial(session.id, {
        title: kc.title || planned.titleHint || 'Untitled',
        source: 'agent-loop:multi-agent',
        summary: kc.summary?.slice(0, 500) || '',
        field: kc.field,
        authors: kc.authors,
        year: kc.year,
      })
      const updated: SessionStep = {
        ...pending,
        status: 'done',
        outputSummary: summary,
        materialId: mat?.id,
        knowledgeCard: kc,
        durationMs: output.totalDurationMs,
        costUsd: stepCost,
        finishedAt: Date.now(),
      }
      const session2 = await getSession(session.id)
      if (session2) {
        const newSteps = [...session2.steps]
        newSteps[stepIndex] = updated
        await updateSession(session.id, { steps: newSteps })
      }
      onStage?.({
        id: 'step-done',
        label: `Step ${stepIndex + 1} done (KC built)`,
        detail: kc.title || '',
        stepIndex,
        durationMs: updated.durationMs!,
        costUsd: updated.costUsd!,
      })
      return {
        step: updated,
        materialTitle: kc.title,
        materialSource: 'agent-loop:multi-agent',
      }
    }

    throw new Error(`unknown step kind: ${(planned as any).kind}`)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    const updated: SessionStep = {
      ...pending,
      status: 'failed',
      error: errMsg,
      durationMs: Date.now() - startedAt,
      finishedAt: Date.now(),
    }
    const session2 = await getSession(session.id)
    if (session2) {
      const newSteps = [...session2.steps]
      newSteps[stepIndex] = updated
      await updateSession(session.id, { steps: newSteps })
    }
    onStage?.({
      id: 'step-failed',
      label: `Step ${stepIndex + 1} failed`,
      detail: errMsg,
      stepIndex,
      error: errMsg,
    })
    return { step: updated }
  }
}

// ============================================================================
// Public entrypoint
// ============================================================================

export async function runAgent(input: AgentLoopInput): Promise<AgentLoopResult> {
  const startedAt = Date.now()
  const maxSteps = Math.min(Math.max(input.maxSteps || 4, 1), 6)
  const onStage = input.onStage
  const onAgentToken = input.onAgentToken

  // v2.4.0 fix — 启用 UsageCollector ALS 上下文，让 Planner / Synthesizer / step 内 multi-agent
  // 的所有 LLM 调用都能记录 cost，否则 recordUsage() 拿不到 store，cost 全部丢失为 0
  beginCollection()

  // 1. 创建或恢复 session
  let session: AgentSession | null = null
  if (input.sessionId) {
    session = await getSession(input.sessionId)
    if (!session) throw new Error(`session not found: ${input.sessionId}`)
    if (session.status !== 'running') {
      throw new Error(`session ${input.sessionId} is ${session.status}, not running`)
    }
  } else {
    session = await createSession({
      goal: input.goal,
      locale: input.outputLocale || detectLocale(input.goal) || 'en',
    })
  }

  onStage?.({
    id: 'goal-loaded',
    label: 'Goal loaded',
    detail: input.goal.slice(0, 200),
  })

  // 2. Planner
  onStage?.({ id: 'planning', label: 'Planning steps' })
  let plan: PlannerOutput
  try {
    plan = await planSteps(input.goal, maxSteps, onAgentToken)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await updateSession(session.id, { status: 'failed', error: `planner: ${msg}` })
    onStage?.({ id: 'error', label: 'Planner failed', error: msg })
    throw err
  }
  onStage?.({
    id: 'plan-ready',
    label: `Plan ready: ${plan.steps.length} steps`,
    detail: plan.rationale.slice(0, 200),
  })

  // 3. Step executor — 串行（避免多 LLM 调用同时跑爆 Vercel timeout）
  const stepResults: Array<{ step: SessionStep; materialTitle?: string; materialSource?: string }> = []
  let totalCost = 0
  let totalPrompt = 0
  let totalCompletion = 0
  for (let i = 0; i < plan.steps.length; i++) {
    if (input.signal?.aborted) break
    const result = await executeStep(plan.steps[i], i, session, onStage)
    stepResults.push(result)
    totalCost += result.step.costUsd || 0
  }

  // 4. Synthesizer
  onStage?.({ id: 'synthesizing', label: 'Synthesizing answer' })
  let synth: { answer: string; references: AgentLoopResult['references'] }
  try {
    synth = await synthesize(input.goal, stepResults, onAgentToken)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await updateSession(session.id, { status: 'failed', error: `synthesizer: ${msg}` })
    onStage?.({ id: 'error', label: 'Synthesizer failed', error: msg })
    throw err
  }

  // 5. 落最终答案 + 关 session
  // v2.4.0 fix — 用 endCollection 拿到本次 run 内所有 LLM 调用的真实 cost
  // (Planner + 各 step 内 multi-agent + Synthesizer，全部累加在同一个 collector 里)
  const usageRecords = endCollection() || []
  const collectedCost = usageRecords.reduce((sum, r) => sum + estimateTokenCost(r.model, r.usage), 0)
  if (collectedCost > 0) {
    totalCost = collectedCost
  } else {
    // fallback：把 step 里的 cost 累加（旧逻辑）
    for (const r of stepResults) totalCost += r.step.costUsd || 0
  }

  const finalSession = await updateSession(session.id, {
    status: 'done',
    finalAnswer: synth.answer,
    references: synth.references,
    totalCostUsd: totalCost,
    totalUsage: {
      promptTokens: totalPrompt,
      completionTokens: totalCompletion,
      totalTokens: totalPrompt + totalCompletion,
    },
  })

  onStage?.({
    id: 'done',
    label: 'Done',
    costUsd: totalCost,
    stepCount: plan.steps.length,
    durationMs: Date.now() - startedAt,
  })

  return {
    sessionId: session.id,
    finalAnswer: synth.answer,
    references: synth.references,
    steps: finalSession?.steps || [],
    totalCostUsd: totalCost,
    totalUsage: {
      promptTokens: totalPrompt,
      completionTokens: totalCompletion,
      totalTokens: totalPrompt + totalCompletion,
    },
    totalDurationMs: Date.now() - startedAt,
  }
}

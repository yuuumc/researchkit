/**
 * Research Coordinator — LLM-driven 多 Agent 协调器
 *
 * 升级版（Agent 化）：
 * 1. Planner 先看输入 + Agent 能力清单，输出 Plan（rationale + steps + dependencies）
 * 2. Coordinator 按 Plan 执行，同 parallel_group 并行，跨 group 串行
 * 3. 执行后调 Reflection Agent，决定是否补调 Agent
 * 4. 返回完整 trace（plan + execution + reflection），便于评委可视化
 *
 * 这才是真正的 Agent：自主规划 + 工具调用 + 多步执行 + 反思
 */

import { AgentMessage, createMessage } from './mcp'
import { ReaderAgent, ReaderOutput } from './agents/reader'
import { AnalyzerAgent, AnalyzerOutput } from './agents/analyzer'
import { TerminologyAgent, TerminologyOutput } from './agents/terminology'
import { KnowledgeBuilderAgent, KnowledgeCard } from './agents/knowledge-builder'
import { RecommendationAgent, RecommendationOutput } from './agents/recommendation'
import { ExportAgent, ExportOutput } from './agents/export'
import { PlannerAgent, Plan, PlanStep, PlannedToolCall, reflect, ReflectionResult, replan, ReplanResult } from './planner'
import { callTool } from './tools/registry'
import { ToolCall } from './tools/types'
import { detectLocale, Locale, buildLanguageDirective } from './locale'

export interface CoordinatorInput {
  content: string
  title?: string
  source?: string
  language?: 'zh' | 'en'
  /**
   * 可选：阶段进度回调（用于 SSE 实时推送进度给前端）
   * 触发时机：每个关键阶段开始时
   */
  onStage?: (stage: CoordinatorStage) => void
}

/**
 * 进度阶段 — 与前端 STAGES 对齐
 */
export type CoordinatorStage =
  | { id: 1; label: 'Document Loaded'; detail?: string }
  | { id: 2; label: 'Plan Generated'; detail?: string }
  | { id: 3; label: 'Concepts Extracted'; detail?: string }
  | { id: 4; label: 'Knowledge Card Built'; detail?: string }
  | { id: 5; label: 'Reflection Loop'; detail?: string }
  | { id: 6; label: 'Exports Ready'; detail?: string }
  | { id: 7; label: 'Done'; detail?: string }

export interface ExecutedStep {
  step: PlanStep
  success: boolean
  durationMs: number
  output?: any
  error?: string
}

/**
 * 反思循环的迭代 trace — 评委可视化用
 */
export interface ReflectionIteration {
  iteration: number               // 1, 2, ...
  reflection: ReflectionResult    // 这次反思的结果
  replan?: ReplanResult           // 这次反思后的补调决策（最后一次可能没有）
  supplementary_execution?: ExecutedStep[]  // 这次补调执行了哪些 step
  supplementary_duration_ms?: number
  replan_duration_ms?: number
  reflection_duration_ms: number
}

export interface CoordinatorOutput {
  plan: Plan                          // LLM 生成的执行计划
  plannerDurationMs: number           // Planner 自身耗时
  knowledgeCard: KnowledgeCard
  recommendations: RecommendationOutput
  exports: ExportOutput
  execution: ExecutedStep[]          // 执行 trace（含补调步骤）
  reflection: ReflectionResult       // 最终反思结果
  reflectionDurationMs: number       // 最终反思耗时
  iterations: ReflectionIteration[] // 反思循环完整 trace
  totalIterations: number            // 实际跑了几轮反思
  toolCalls: ToolCall[]              // MCP 工具调用 trace
  toolCallDurationMs: number
  pipeline: Array<{                   // 简化 trace（向后兼容）
    agent: string
    durationMs: number
    success: boolean
  }>
  totalDurationMs: number
}

// Agent 注册表 — 名字 → Agent 实例
const AGENTS: Record<string, typeof ReaderAgent> = {
  Reader: ReaderAgent,
  Analyzer: AnalyzerAgent,
  Terminology: TerminologyAgent,
  KnowledgeBuilder: KnowledgeBuilderAgent,
  Recommendation: RecommendationAgent,
  Export: ExportAgent,
}

/**
 * 调用单个 Agent 处理消息
 */
async function callAgent(
  agent: typeof ReaderAgent,
  message: AgentMessage
): Promise<{ result: any; durationMs: number; error?: string }> {
  const start = Date.now()
  try {
    const response = await agent.handleMessage(message)
    return {
      result: response.payload,
      durationMs: Date.now() - start,
    }
  } catch (err) {
    return {
      result: { error: err instanceof Error ? err.message : 'Agent failed' },
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'Agent failed',
    }
  }
}

/**
 * 构建发给某 Agent 的 task 消息（根据 Agent 类型构造 payload）
 *
 * 升级版：
 * - Analyzer 接收 required_schema + input_type（Planner 决定的字段动态化）
 * - Terminology 接收 analyzerMethodology（避免与方法学重复）
 * - 所有 Agent 可接收 prompt_patches（Replan 阶段为缺失字段定制 prompt 补丁）
 */
function buildTaskMessage(
  step: PlanStep,
  input: CoordinatorInput,
  results: Record<string, any>,
  plan: Plan,
  promptPatches?: Record<string, { focus_fields: string[]; ignore_fields: string[]; extra_instruction: string }>,
  sourceLocale?: Locale,
  targetLocale?: Locale,
  languageDirective?: string
): AgentMessage {
  const basePayload: any = {
    content: input.content,
    source_locale: sourceLocale,
    target_locale: targetLocale,
    language_directive: languageDirective,
  }

  // 如果有 prompt_patches 给当前 agent，注入补丁
  const patch = promptPatches?.[step.agent]
  if (patch) {
    basePayload.prompt_patch = patch
  }

  switch (step.agent) {
    case 'Analyzer':
      basePayload.readerOutput = results['Reader'] || null
      basePayload.required_schema = plan.required_schema
      basePayload.input_type = plan.input_type
      break
    case 'KnowledgeBuilder':
      basePayload.title = input.title
      basePayload.readerOutput = results['Reader']
      basePayload.analyzerOutput = results['Analyzer']
      basePayload.terminologyOutput = results['Terminology']
      break
    case 'Recommendation':
      basePayload.knowledgeCard = results['KnowledgeBuilder']
      break
    case 'Terminology':
      // 把 Analyzer 的 methodology 传给 Terminology，让其避免重复提取
      basePayload.analyzerMethodology = results['Analyzer']?.methodology || ''
      break
    case 'Export':
      basePayload.knowledgeCard = results['KnowledgeBuilder']
      basePayload.recommendations = results['Recommendation'] || { recommendations: [], searchKeywords: [] }
      basePayload.source = input.source
      break
    // Reader 只需要 content（+ 可选 prompt_patch）
  }

  return createMessage('task', 'Coordinator', step.agent, basePayload)
}

/**
 * 按 parallel_group 分组执行 steps
 * - 同 group 内的并行（Promise.all）
 * - 跨 group 串行
 *
 * 升级版：支持 prompt_patches（Replan 阶段为缺失字段定制 prompt）
 */
async function executePlan(
  plan: Plan,
  input: CoordinatorInput,
  promptPatches?: Record<string, { focus_fields: string[]; ignore_fields: string[]; extra_instruction: string }>,
  sourceLocale?: Locale,
  targetLocale?: Locale,
  languageDirective?: string
): Promise<{ execution: ExecutedStep[]; results: Record<string, any> }> {
  const execution: ExecutedStep[] = []
  const results: Record<string, any> = {}

  // 按 parallel_group 排序
  const sortedSteps = [...plan.steps].sort((a, b) => a.parallel_group - b.parallel_group)
  const groups = new Map<number, PlanStep[]>()
  for (const step of sortedSteps) {
    if (!groups.has(step.parallel_group)) groups.set(step.parallel_group, [])
    groups.get(step.parallel_group)!.push(step)
  }

  for (const [groupId, steps] of Array.from(groups.entries()).sort((a, b) => a[0] - b[0])) {
    // 并行执行同组的所有 steps
    const execResults = await Promise.all(
      steps.map(async (step) => {
        const agent = AGENTS[step.agent]
        if (!agent) {
          return {
            step,
            success: false,
            durationMs: 0,
            error: `Unknown agent: ${step.agent}`,
          }
        }
        const message = buildTaskMessage(step, input, results, plan, promptPatches, sourceLocale, targetLocale, languageDirective)
        const { result, durationMs, error } = await callAgent(agent, message)
        const success = !error && !result?.error
        if (success) {
          results[step.agent] = result
        }
        return {
          step,
          success,
          durationMs,
          output: result,
          error,
        }
      })
    )
    execution.push(...execResults)
  }

  return { execution, results }
}

/**
 * 执行 LLM 规划的 tool_calls
 * - 对 memory.save：用 KnowledgeBuilder 的实际结果填充 title/authors/field/summary
 * - 对 filesystem.save_markdown：用 Export 的实际结果填充 content
 * - 对其他工具：直接用 LLM 给的 input
 */
async function executeToolCalls(
  plan: Plan,
  input: CoordinatorInput,
  knowledgeCard: KnowledgeCard,
  exports: ExportOutput
): Promise<{ calls: ToolCall[]; durationMs: number }> {
  const start = Date.now()

  if (!plan.tool_calls || plan.tool_calls.length === 0) {
    return { calls: [], durationMs: 0 }
  }

  // 准备每个工具的 input（覆盖 LLM 给的占位符）
  const preparedCalls = plan.tool_calls.map((planned: PlannedToolCall) => {
    const inputClone: Record<string, any> = { ...planned.input }

    if (planned.tool === 'memory' && inputClone.action === 'save') {
      // 用实际 KnowledgeCard 字段填充
      inputClone.title = knowledgeCard.title || inputClone.title
      inputClone.authors = knowledgeCard.authors || inputClone.authors || []
      inputClone.field = knowledgeCard.field || inputClone.field || ''
      inputClone.summary = knowledgeCard.summary || inputClone.summary || ''
      inputClone.source = input.source || inputClone.source
      inputClone.tags = knowledgeCard.tags || inputClone.tags || []
    } else if (planned.tool === 'filesystem' && inputClone.action === 'save_markdown') {
      // 用 Export 的实际 markdown 填充
      inputClone.content = exports.markdown || inputClone.content || ''
      inputClone.filename = knowledgeCard.title || inputClone.filename || `knowledge-card-${Date.now()}`
    } else if (planned.tool === 'filesystem' && inputClone.action === 'save_json') {
      inputClone.content = exports.json || inputClone.content || JSON.stringify(knowledgeCard)
      inputClone.filename = knowledgeCard.title || inputClone.filename || `knowledge-card-${Date.now()}`
    }

    return {
      tool: planned.tool,
      input: inputClone,
      reason: planned.reason,
    }
  })

  // 并行执行所有工具调用
  const calls = await Promise.all(
    preparedCalls.map(pc => callTool(pc.tool, pc.input, 'Coordinator'))
  )

  return { calls, durationMs: Date.now() - start }
}

/**
 * 主协调函数 — Plan-driven + Reflection Loop + Tool Use
 *
 * 真正的 Agent 闭环：
 * 1. Planner 生成 plan
 * 2. 执行 plan
 * 3. Reflect 检查结果
 * 4. 如果 !satisfied && iter < max：replan → 执行补充步骤 → KB 重建 → 再 reflect
 * 5. 直到 satisfied 或触顶
 * 6. 执行 MCP 工具调用
 */
const MAX_ITERATIONS = 2  // 最多反思 2 轮（避免成本爆炸）

export async function coordinate(input: CoordinatorInput): Promise<CoordinatorOutput> {
  const startTime = Date.now()
  const onStage = input.onStage

  // ===== Locale 检测（升级版：两阶段语言架构） =====
  // 入口检测一次，所有 Agent 共享
  const sourceLocale = detectLocale(input.content)
  const targetLocale: Locale = sourceLocale  // 默认目标 = 源语言（不翻译，避免信息丢失）
  const languageDirective = buildLanguageDirective(sourceLocale, targetLocale)

  // ===== Step 1: Planning =====
  onStage?.({ id: 1, label: 'Document Loaded' })
  const plannerTask = createMessage('task', 'Coordinator', 'Planner', {
    content: input.content,
    source_locale: sourceLocale,
    target_locale: targetLocale,
    language_directive: languageDirective,
  })
  const plannerStart = Date.now()
  const plannerResult = await callAgent(PlannerAgent, plannerTask)
  const plannerDurationMs = Date.now() - plannerStart
  const plan: Plan = (plannerResult.result?.plan) || fallbackPlan(input)
  onStage?.({ id: 2, label: 'Plan Generated', detail: `complexity=${plan.complexity}, steps=${plan.steps.length}` })

  // ===== Step 2: Initial Execution =====
  onStage?.({ id: 3, label: 'Concepts Extracted', detail: 'Reader + Analyzer + Terminology 并行分析' })
  let { execution, results } = await executePlan(plan, input, undefined, sourceLocale, targetLocale, languageDirective)

  // ===== Step 3: Reflection Loop =====
  const iterations: ReflectionIteration[] = []
  let finalReflection: ReflectionResult = {
    satisfied: true,
    missing: [],
    reasoning: '反思未执行',
    additional_steps: [],
    review: {
      student_useful: true,
      researcher_trust: true,
      has_confusion: false,
      confusion_points: [],
    },
  }
  let finalReflectionDurationMs = 0
  let totalIterations = 0
  let currentKnowledgeCard: KnowledgeCard | null = null

  for (let iter = 1; iter <= MAX_ITERATIONS; iter++) {
    // 3a. Reflect
    currentKnowledgeCard = extractKnowledgeCard(results, input)
    if (iter === 1) onStage?.({ id: 4, label: 'Knowledge Card Built', detail: `KB 初始构建完成，进入反思` })
    const reflectionStart = Date.now()
    if (iter === 1) onStage?.({ id: 5, label: 'Reflection Loop', detail: `iteration ${iter}/${MAX_ITERATIONS}` })
    const reflection = await reflect(plan, results, currentKnowledgeCard, languageDirective)
    const reflectionDurationMs = Date.now() - reflectionStart

    finalReflection = reflection
    finalReflectionDurationMs = reflectionDurationMs
    totalIterations = iter

    const iterationTrace: ReflectionIteration = {
      iteration: iter,
      reflection,
      reflection_duration_ms: reflectionDurationMs,
    }

    // 3b. 如果 satisfied 或 触顶，结束循环
    if (reflection.satisfied) {
      iterations.push(iterationTrace)
      break
    }

    if (iter >= MAX_ITERATIONS) {
      iterationTrace.replan = {
        should_continue: false,
        reasoning: `已达到最大迭代次数 ${MAX_ITERATIONS}，停止反思循环`,
        supplementary_steps: [],
        adjust_prompt_for: [],
        prompt_patches: {},
      }
      iterations.push(iterationTrace)
      break
    }

    // 3c. Replan — 让 LLM 决定补调哪些 Agent
    const replanStart = Date.now()
    const replanResult = await replan(
      plan,
      reflection,
      execution,
      currentKnowledgeCard,
      iter,
      MAX_ITERATIONS,
      languageDirective
    )
    const replanDurationMs = Date.now() - replanStart
    iterationTrace.replan = replanResult
    iterationTrace.replan_duration_ms = replanDurationMs

    // 3d. 如果 replan 说不用继续，结束
    if (!replanResult.should_continue || replanResult.supplementary_steps.length === 0) {
      iterations.push(iterationTrace)
      break
    }

    // 3e. 执行补充步骤（同步更新 results，让 KB 重建能用上新结果）
    // 升级版：把 replan 的 prompt_patches 传给重跑的 Agent
    const supplementaryPlan: Plan = {
      ...plan,
      steps: replanResult.supplementary_steps,
      tool_calls: [],  // 补调阶段不调工具
    }
    const suppStart = Date.now()
    const { execution: suppExecution, results: suppResults } = await executePlan(
      supplementaryPlan,
      input,
      replanResult.prompt_patches,
      sourceLocale,
      targetLocale,
      languageDirective
    )
    const suppDurationMs = Date.now() - suppStart

    iterationTrace.supplementary_execution = suppExecution
    iterationTrace.supplementary_duration_ms = suppDurationMs

    // 合并：补充步骤的结果覆盖原结果
    for (const [agent, output] of Object.entries(suppResults)) {
      results[agent] = output
    }
    execution = [...execution, ...suppExecution]

    iterations.push(iterationTrace)

    // 3f. 如果补充步骤里有 KnowledgeBuilder 重新跑了，下一轮 reflect 会看到新结果
    // 如果没跑 KB，但 Analyzer/Terminology 重跑了，下一轮 KB 自动用新结果（在 extractKnowledgeCard 中处理）
    // 让 KB 在下次迭代时自动重建
    if (suppResults['KnowledgeBuilder']) {
      results['KnowledgeBuilder'] = suppResults['KnowledgeBuilder']
    } else if (suppResults['Analyzer'] || suppResults['Terminology'] || suppResults['Reader']) {
      // 自动触发 KB 重建
      const kbMessage = createMessage('task', 'Coordinator', 'KnowledgeBuilder', {
        title: input.title,
        content: input.content,
        readerOutput: results['Reader'],
        analyzerOutput: results['Analyzer'],
        terminologyOutput: results['Terminology'],
      })
      const kbResult = await callAgent(KnowledgeBuilderAgent, kbMessage)
      if (kbResult.result && !kbResult.result.error) {
        results['KnowledgeBuilder'] = kbResult.result
        execution.push({
          step: {
            id: `step-auto-kb-${iter}`,
            agent: 'KnowledgeBuilder',
            reason: `迭代 ${iter}：Analyzer/Terminology 重跑后自动重建知识卡`,
            parallel_group: 100 + iter,
            depends_on: replanResult.supplementary_steps.map(s => s.id),
            required: true,
          },
          success: !kbResult.error,
          durationMs: kbResult.durationMs,
          output: kbResult.result,
          error: kbResult.error,
        })
      }
    }

    // 继续下一轮 reflection
  }

  // ===== Step 4: Finalize results =====
  const knowledgeCard: KnowledgeCard = currentKnowledgeCard || extractKnowledgeCard(results, input)

  const recommendations: RecommendationOutput = results['Recommendation'] || {
    recommendations: [],
    searchKeywords: [],
  }

  // 重新执行 Export（用最终 KB 结果）— 确保导出的是最新版本
  // 注意：用 knowledgeCard 变量（已兜底），不用 results['KnowledgeBuilder']（可能 undefined）
  const exportMessage = createMessage('task', 'Coordinator', 'Export', {
    knowledgeCard: knowledgeCard,
    recommendations: results['Recommendation'] || { recommendations: [], searchKeywords: [], searchIntents: [] },
    source: input.source,
  })
  const exportResult = await callAgent(ExportAgent, exportMessage)
  const exports: ExportOutput = exportResult.result?.markdown !== undefined
    ? exportResult.result
    : { markdown: '', obsidian: '', json: '' }

  // 如果 Export 重跑了，加到 execution trace
  if (!exportResult.error) {
    execution.push({
      step: {
        id: 'step-final-export',
        agent: 'Export',
        reason: '反思循环结束后用最终 KB 结果重新导出',
        parallel_group: 999,
        depends_on: [],
        required: true,
      },
      success: true,
      durationMs: exportResult.durationMs,
      output: exportResult.result,
    })
  }

  // ===== Step 5: Tool Use =====
  onStage?.({ id: 6, label: 'Exports Ready', detail: '生成 Markdown / Obsidian / Mindmap' })
  const { calls: toolCalls, durationMs: toolCallDurationMs } = await executeToolCalls(
    plan, input, knowledgeCard, exports
  )

  // 简化 pipeline
  const pipeline = execution.map(e => ({
    agent: e.step.agent,
    durationMs: e.durationMs,
    success: e.success,
  }))

  return {
    plan,
    plannerDurationMs,
    knowledgeCard,
    recommendations,
    exports,
    execution,
    reflection: finalReflection,
    reflectionDurationMs: finalReflectionDurationMs,
    iterations,
    totalIterations,
    toolCalls,
    toolCallDurationMs,
    pipeline,
    totalDurationMs: Date.now() - startTime,
  }
}

/**
 * 从 results 中提取 KnowledgeCard — 兼容 KB 直接结果和需要重建的情况
 */
function extractKnowledgeCard(
  results: Record<string, any>,
  input: CoordinatorInput
): KnowledgeCard {
  if (results['KnowledgeBuilder']) {
    return results['KnowledgeBuilder'] as KnowledgeCard
  }
  return {
    title: input.title || 'Untitled',
    authors: [],
    field: '',
    difficulty: 'Intermediate' as const,
    summary: '',
    research_goals: [],
    innovation: [],
    methodology: '',
    experiments: [],
    results: [],
    limitations: [],
    future_work: [],
    key_terms: [],
    applications: [],
    datasets: [],
    citations: [],
    references: [],
    tags: ['researchkit'],
  }
}

/**
 * 兜底 Plan（如果 Planner 调用失败，用默认 pipeline）
 */
function fallbackPlan(input: CoordinatorInput): Plan {
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

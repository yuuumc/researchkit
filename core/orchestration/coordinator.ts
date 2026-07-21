/**
 * Coordinator — 薄壳协调器
 *
 * v2.0 重构 — 从 lib/coordinator.ts 拆分
 *
 * 职责（薄壳）：
 * - 检测 locale（源语言 + 目标语言 = 默认相同，不翻译）
 * - 串接：planner → executor → workflow → export → toolCalls
 * - 触发 onStage 回调（SSE 推送）
 * - 组装 CoordinatorOutput 返回给 SSE route
 *
 * 不参与：调用具体 Agent / 反思循环逻辑 / 工具调用细节
 * （这些都已拆到 planner.ts / executor.ts / workflow.ts）
 *
 * 真正的 Agent 闭环：
 * 1. Planner 生成 plan
 * 2. Executor 执行 plan
 * 3. Workflow Reflect → 不满意则 Replan → 执行补充步骤 → KB 重建 → 再 Reflect
 * 4. 直到 satisfied 或触顶
 * 5. 最终 Export + Tool Use
 */

import { detectLocale, buildLanguageDirective, Locale } from '@/lib/locale'
import { ExportAgent } from '@/lib/agents/export'
import { beginCollection, endCollection, type ChatUsage, type AgentUsageSummary } from '@/lib/usage-collector'
import type {
  KnowledgeCard,
  RecommendationOutput,
  ExportOutput,
  Plan,
  ExecutedStep,
  ReflectionResult,
  ReflectionIteration,
  AgentContext,
  AnalyzerField,
} from '@/types'
import { runPlanner, fallbackPlan } from './planner'
import { executePlan, executeToolCalls, callAgent } from './executor'
import { runReflectionLoop, extractKnowledgeCard } from './workflow'

// ============================================================================
// 公开类型 — 重新导出供 SSE route 使用
// ============================================================================

export type CoordinatorStage =
  | { id: 1; label: 'Document Loaded'; detail?: string }
  | { id: 2; label: 'Plan Generated'; detail?: string }
  | { id: 3; label: 'Concepts Extracted'; detail?: string }
  | { id: 4; label: 'Knowledge Card Built'; detail?: string }
  | { id: 5; label: 'Reflection Loop'; detail?: string }
  | { id: 6; label: 'Exports Ready'; detail?: string }
  | { id: 7; label: 'Done'; detail?: string }

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
  toolCalls: import('@/lib/tools/types').ToolCall[]
  toolCallDurationMs: number
  pipeline: Array<{                   // 简化 trace（向后兼容）
    agent: string
    durationMs: number
    success: boolean
  }>
  totalDurationMs: number
  // ===== D6 Cost & Token Dashboard =====
  /** 本次 Pipeline 的总 token 用量 */
  totalUsage?: ChatUsage
  /** 本次 Pipeline 的总成本（USD） */
  totalCostUsd?: number
  /** 按 Agent 聚合的 token/cost 详情 */
  perAgentUsage?: AgentUsageSummary[]
}

// ============================================================================
// 主协调函数
// ============================================================================

/**
 * 主协调函数 — Plan-driven + Reflection Loop + Tool Use
 *
 * 真正的 Agent 闭环（薄壳版）：
 * 1. Locale 检测（入口一次，所有 Agent 共享）
 * 2. Planner 生成 plan
 * 3. Executor 执行 plan
 * 4. Workflow 反思循环（≤ MAX_ITERATIONS 轮）
 * 5. 最终 Export + Tool Use
 */
export async function coordinate(input: CoordinatorInput): Promise<CoordinatorOutput> {
  const startTime = Date.now()
  const onStage = input.onStage

  // D6 Cost & Token Dashboard — 入口开始采集
  const collector = beginCollection()

  // ===== Locale 检测（升级版：两阶段语言架构） =====
  // 入口检测一次，所有 Agent 共享
  const sourceLocale = detectLocale(input.content)
  const targetLocale: Locale = sourceLocale  // 默认目标 = 源语言（不翻译，避免信息丢失）
  const languageDirective = buildLanguageDirective(sourceLocale, targetLocale)

  // ===== Step 1: Planning =====
  onStage?.({ id: 1, label: 'Document Loaded' })
  const { plan, durationMs: plannerDurationMs } = await runPlanner(
    input,
    sourceLocale,
    targetLocale,
    languageDirective
  )
  onStage?.({ id: 2, label: 'Plan Generated', detail: `complexity=${plan.complexity}, steps=${plan.steps.length}` })

  // ===== Step 2: Initial Execution =====
  onStage?.({ id: 3, label: 'Concepts Extracted', detail: 'Reader + Analyzer + Terminology 并行分析' })
  const { execution: initialExecution, results: initialResults } = await executePlan(
    plan,
    input,
    undefined,
    sourceLocale,
    targetLocale,
    languageDirective
  )

  // ===== Step 3: Reflection Loop =====
  const workflow = await runReflectionLoop(
    plan,
    initialExecution,
    initialResults,
    input,
    { sourceLocale, targetLocale, languageDirective },
    onStage
  )

  let execution = workflow.execution
  let results = workflow.results
  let currentKnowledgeCard = workflow.knowledgeCard

  // ===== Step 4: Finalize results =====
  const knowledgeCard: KnowledgeCard = currentKnowledgeCard || extractKnowledgeCard(results, input)

  const recommendations: RecommendationOutput = results['Recommendation'] || {
    recommendations: [],
    searchKeywords: [],
  }

  // 重新执行 Export（用最终 KB 结果）— 走 v2.0 统一 AgentInterface
  // 构造 ExportAgent 的 AgentContext
  const exportCtx: AgentContext = {
    document: {
      content: input.content || '',
      language: 'en',
      locale: sourceLocale,
      title: input.title,
      source: input.source,
    },
    workflow: {
      inputType: plan.input_type as AgentContext['workflow']['inputType'],
      requiredSchema: (plan.required_schema || []) as AnalyzerField[],
      complexity: plan.complexity as 'low' | 'medium' | 'high',
      plan,
    },
    previous: {
      knowledgeCard,
      recommendation: results['Recommendation'] as RecommendationOutput | undefined,
    },
    options: {
      locale: targetLocale,
      sourceLocale,
      languageDirective,
    },
  }
  const exportResult = await callAgent(new ExportAgent(), exportCtx)
  const exports: ExportOutput = exportResult.success && exportResult.data?.markdown !== undefined
    ? exportResult.data as ExportOutput
    : { markdown: '', obsidian: '', json: '', mindmap: '' }

  // 如果 Export 重跑了，加到 execution trace
  if (exportResult.success) {
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
      output: exportResult.data,
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

  // D6 Cost & Token Dashboard — 出口汇总 + 清空全局状态
  const usageSummary = collector.summarize()
  endCollection()  // 清空 currentCollector，避免污染下个请求

  return {
    plan,
    plannerDurationMs,
    knowledgeCard,
    recommendations,
    exports,
    execution,
    reflection: workflow.finalReflection,
    reflectionDurationMs: workflow.finalReflectionDurationMs,
    iterations: workflow.iterations,
    totalIterations: workflow.totalIterations,
    toolCalls,
    toolCallDurationMs,
    pipeline,
    totalDurationMs: Date.now() - startTime,
    // D6
    totalUsage: usageSummary.totalUsage,
    totalCostUsd: usageSummary.totalCostUsd,
    perAgentUsage: usageSummary.perAgent,
  }
}

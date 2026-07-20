/**
 * Executor — 按 Plan 执行 Agent + 调用 MCP 工具
 *
 * v2.0 重构 — 从 lib/coordinator.ts 拆分
 *
 * 职责：
 * - 维护 Agent 注册表（name → Agent 实例）
 * - callAgent: 调用单个 Agent
 * - buildTaskMessage: 根据 Agent 类型构造 payload
 * - executePlan: 按 parallel_group 分组并行执行（同组并行，跨组串行）
 * - executeToolCalls: 执行 LLM 规划的工具调用（memory / filesystem）
 *
 * 不参与：Planner 调用 / 反思循环 / Locale 检测
 */

import { ReaderAgent } from '@/lib/agents/reader'
import { AnalyzerAgent } from '@/lib/agents/analyzer'
import { TerminologyAgent } from '@/lib/agents/terminology'
import { KnowledgeBuilderAgent } from '@/lib/agents/knowledge-builder'
import { RecommendationAgent } from '@/lib/agents/recommendation'
import { ExportAgent } from '@/lib/agents/export'
import { createMessage, AgentMessage } from '@/lib/mcp'
import { callTool } from '@/lib/tools/registry'
import type { ToolCall } from '@/lib/tools/types'
import type { Locale } from '@/lib/locale'
import type {
  Plan,
  PlanStep,
  PlannedToolCall,
  ExecutedStep,
  KnowledgeCard,
} from '@/types'
import type { ExportOutput } from '@/types'
import type { CoordinatorInput } from './coordinator'

// ============================================================================
// Agent 注册表 — 名字 → Agent 实例
// ============================================================================

type AnyAgent = typeof ReaderAgent

const AGENTS: Record<string, AnyAgent> = {
  Reader: ReaderAgent,
  Analyzer: AnalyzerAgent,
  Terminology: TerminologyAgent,
  KnowledgeBuilder: KnowledgeBuilderAgent,
  Recommendation: RecommendationAgent,
  Export: ExportAgent,
}

// ============================================================================
// callAgent — 调用单个 Agent
// ============================================================================

/**
 * 调用单个 Agent 处理消息
 *
 * @returns { result, durationMs, error? } — 不抛错，错误通过返回值传递
 */
export async function callAgent(
  agent: AnyAgent,
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

// ============================================================================
// buildTaskMessage — 构造 Agent 任务消息
// ============================================================================

/**
 * 构建发给某 Agent 的 task 消息（根据 Agent 类型构造 payload）
 *
 * - Analyzer 接收 required_schema + input_type（Planner 决定的字段动态化）
 * - Terminology 接收 analyzerMethodology（避免与方法学重复）
 * - 所有 Agent 可接收 prompt_patches（Replan 阶段为缺失字段定制 prompt 补丁）
 */
export function buildTaskMessage(
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

// ============================================================================
// executePlan — 按 parallel_group 分组并行执行
// ============================================================================

/**
 * 按 parallel_group 分组执行 steps
 * - 同 group 内的并行（Promise.all）
 * - 跨 group 串行
 *
 * 升级版：支持 prompt_patches（Replan 阶段为缺失字段定制 prompt）
 */
export async function executePlan(
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

// ============================================================================
// executeToolCalls — 执行 MCP 工具调用
// ============================================================================

/**
 * 执行 LLM 规划的 tool_calls
 * - 对 memory.save：用 KnowledgeBuilder 的实际结果填充 title/authors/field/summary
 * - 对 filesystem.save_markdown：用 Export 的实际结果填充 content
 * - 对其他工具：直接用 LLM 给的 input
 */
export async function executeToolCalls(
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

// ============================================================================
// runSingleAgent — 单独调用某 Agent（workflow 反思补调用）
// ============================================================================

/**
 * 单独调用某 Agent — workflow 反思循环中触发补调用时使用
 *
 * 例如：Analyzer/Terminology 重跑后需要重建 KB
 */
export async function runSingleAgent(
  agentName: string,
  payload: Record<string, any>
): Promise<{ result: any; durationMs: number; error?: string }> {
  const agent = AGENTS[agentName]
  if (!agent) {
    return {
      result: { error: `Unknown agent: ${agentName}` },
      durationMs: 0,
      error: `Unknown agent: ${agentName}`,
    }
  }
  const message = createMessage('task', 'Coordinator', agentName, payload)
  return callAgent(agent, message)
}

/**
 * Executor — 按 Plan 执行 Agent + 调用 MCP 工具
 *
 * v2.0 重构 — Day 5 升级：
 * - Agent 注册表改为 `Record<string, AgentInterface>`（实例而非类）
 * - callAgent 改为调 `agent.execute(ctx)`，返回 AgentResult
 * - buildTaskMessage 改为 buildAgentContext（构造 AgentContext）
 * - executePlan 用新接口
 *
 * 不参与：Planner 调用 / 反思循环 / Locale 检测
 */

import { ReaderAgent } from '@/lib/agents/reader'
import { AnalyzerAgent } from '@/lib/agents/analyzer'
import { TerminologyAgent } from '@/lib/agents/terminology'
import { KnowledgeBuilderAgent } from '@/lib/agents/knowledge-builder'
import { RecommendationAgent } from '@/lib/agents/recommendation'
import { ExportAgent } from '@/lib/agents/export'
import { callTool } from '@/lib/tools/registry'
import type { ToolCall } from '@/lib/tools/types'
import type { Locale } from '@/lib/locale'
import { withAgent } from '@/lib/usage-collector'
import type {
  Plan,
  PlanStep,
  PlannedToolCall,
  ExecutedStep,
  KnowledgeCard,
  AgentInterface,
  AgentContext,
  AgentResult,
  AnalyzerField,
} from '@/types'
import type { ExportOutput } from '@/types'
import type { RecommendationOutput } from '@/types'
import type { CoordinatorInput } from './coordinator'
import { localeToLanguage, detectLocale } from '@/lib/locale'

// ============================================================================
// Agent 注册表 — 名字 → Agent 实例（v2.0 class 化）
// ============================================================================

const AGENTS: Record<string, AgentInterface> = {
  Reader: new ReaderAgent(),
  Analyzer: new AnalyzerAgent(),
  Terminology: new TerminologyAgent(),
  KnowledgeBuilder: new KnowledgeBuilderAgent(),
  Recommendation: new RecommendationAgent(),
  Export: new ExportAgent(),
}

/**
 * 获取已注册的 Agent 实例（workflow 反思循环补调用时用）
 */
export function getAgent(name: string): AgentInterface | undefined {
  return AGENTS[name]
}

// ============================================================================
// callAgent — 调用单个 Agent（v2.0 走 execute(ctx)）
// ============================================================================

/**
 * 调用单个 Agent 处理 AgentContext
 *
 * v2.0 升级：直接调 `agent.execute(ctx)`，返回 AgentResult
 *
 * @returns AgentResult — 不抛错，错误通过 success/error 字段传递
 */
export async function callAgent(
  agent: AgentInterface,
  ctx: AgentContext
): Promise<AgentResult> {
  // AgentInterface.execute 内部已 try/catch，不会再 throw
  // 这里保留 try/catch 作为极端情况兜底
  try {
    // D25 Cost Dashboard — 用 withAgent 包住 execute 创建独立 ALS 子上下文
    // 解决并行执行竞态：Promise.all 多个 callAgent 时，每个进入独立子上下文，
    // agentName 不再共享，token 归因准确
    // 旧的 setCurrentAgent 在串行场景仍可用（planner / route）
    return await withAgent(agent.name, () => agent.execute(ctx))
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Agent failed'
    return {
      success: false,
      data: { error: msg },
      durationMs: 0,
      error: msg,
    }
  }
}

// ============================================================================
// buildAgentContext — 构造 AgentContext（v2.0 替代 buildTaskMessage）
// ============================================================================

/**
 * 构建发给某 Agent 的 AgentContext
 *
 * v2.0 升级：原 buildTaskMessage 构造 AgentMessage payload，
 * 现在构造统一的 AgentContext，由 agent.execute(ctx) 接收。
 *
 * - Analyzer 接收 requiredSchema + inputType（Planner 决定的字段动态化）
 * - Terminology 通过 previous.analyzer.methodology 获取方法学（避免重复）
 * - KnowledgeBuilder 通过 previous.{reader,analyzer,terminology} 获取输入
 * - Recommendation 通过 previous.knowledgeCard 获取输入
 * - Export 通过 previous.{knowledgeCard,recommendation} 获取输入
 * - 所有 Agent 可接收 promptPatch（Replan 阶段为缺失字段定制 prompt 补丁）
 */
export function buildAgentContext(
  step: PlanStep,
  input: CoordinatorInput,
  results: Record<string, any>,
  plan: Plan,
  promptPatches?: Record<string, { focus_fields: string[]; ignore_fields: string[]; extra_instruction: string }>,
  sourceLocale?: Locale,
  targetLocale?: Locale,
  languageDirective?: string
): AgentContext {
  // 检测源 locale（如果没传）
  const finalSourceLocale: Locale = sourceLocale || detectLocale(input.content)
  const finalTargetLocale: Locale = targetLocale || finalSourceLocale
  const finalLanguageDirective: string = languageDirective || ''

  // 提取前序 Agent 输出
  const reader = results['Reader']
  const analyzer = results['Analyzer']
  const terminology = results['Terminology']
  const knowledgeCard = results['KnowledgeBuilder']
  const recommendation: RecommendationOutput | undefined = results['Recommendation']

  // 构造 AgentContext
  const ctx: AgentContext = {
    document: {
      content: input.content,
      language: localeToLanguage(finalSourceLocale),
      locale: finalSourceLocale,
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
      reader,
      analyzer,
      terminology,
      knowledgeCard,
      recommendation,
    },
    options: {
      locale: finalTargetLocale,
      sourceLocale: finalSourceLocale,
      languageDirective: finalLanguageDirective,
    },
  }

  // 注入 prompt_patch（Replan 阶段补丁）
  const patch = promptPatches?.[step.agent]
  if (patch) {
    ctx.promptPatch = patch
  }

  return ctx
}

// ============================================================================
// executePlan — 按 parallel_group 分组并行执行
// ============================================================================

/**
 * 按 parallel_group 分组执行 steps
 * - 同 group 内的并行（Promise.all）
 * - 跨 group 串行
 *
 * v2.0 升级：走 agent.execute(ctx)
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
        const ctx = buildAgentContext(
          step, input, results, plan, promptPatches,
          sourceLocale, targetLocale, languageDirective
        )
        const result = await callAgent(agent, ctx)
        const success = result.success && !result.data?.error
        if (success) {
          results[step.agent] = result.data
        }
        return {
          step,
          success,
          durationMs: result.durationMs,
          output: result.data,
          error: result.error,
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
      inputClone.title = knowledgeCard.title || inputClone.title
      inputClone.authors = knowledgeCard.authors || inputClone.authors || []
      inputClone.field = knowledgeCard.field || inputClone.field || ''
      inputClone.summary = knowledgeCard.summary || inputClone.summary || ''
      inputClone.source = input.source || inputClone.source
      inputClone.tags = knowledgeCard.tags || inputClone.tags || []
    } else if (planned.tool === 'filesystem' && inputClone.action === 'save_markdown') {
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
 * v2.0 升级：用 AgentContext 调 agent.execute(ctx)
 * 调用方需要构造完整的 ctx（含 previous 等字段）
 *
 * @param agentName Agent 名称
 * @param payload v1.0 风格的 payload — 内部转换为 AgentContext
 */
export async function runSingleAgent(
  agentName: string,
  payload: Record<string, any>
): Promise<AgentResult> {
  const agent = AGENTS[agentName]
  if (!agent) {
    return {
      success: false,
      data: { error: `Unknown agent: ${agentName}` },
      durationMs: 0,
      error: `Unknown agent: ${agentName}`,
    }
  }

  // 把 v1.0 payload 转换为 AgentContext
  // 这是过渡期兼容：未来调用方应直接传 AgentContext
  const ctx: AgentContext = payloadToContext(payload, agentName)

  return callAgent(agent, ctx)
}

/**
 * 把 v1.0 风格 payload 转换为 AgentContext（过渡期兼容）
 *
 * 未来 v2.1：调用方直接传 AgentContext，删除此函数
 */
// TODO P2-4: payloadToContext 是 v1 遗留，v2.3.1 应改造 runSingleAgent 直接接收 AgentContext，
// 删除此函数。当前唯一调用方是 workflow.ts 的反思循环 KB 重建。
// 详见 docs/v2.3.0-code-review-2026-07-22.md P2-4
function payloadToContext(payload: Record<string, any>, _agentName: string): AgentContext {
  const sourceLocale: Locale = payload.source_locale || 'en-US'
  const targetLocale: Locale = payload.target_locale || sourceLocale

  return {
    document: {
      content: payload.content || '',
      language: 'en',
      locale: sourceLocale,
      title: payload.title,
      source: payload.source,
    },
    workflow: {
      inputType: payload.input_type || 'unknown',
      requiredSchema: payload.required_schema || [],
      complexity: 'medium',
    },
    previous: {
      reader: payload.readerOutput,
      analyzer: payload.analyzerOutput,
      terminology: payload.terminologyOutput,
      knowledgeCard: payload.knowledgeCard,
      recommendation: payload.recommendations,
    },
    options: {
      locale: targetLocale,
      sourceLocale,
      languageDirective: payload.language_directive || '',
    },
    promptPatch: payload.prompt_patch,
  }
}

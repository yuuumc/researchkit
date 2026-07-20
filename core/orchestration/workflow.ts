/**
 * Workflow — Reflection + Replan 反思循环
 *
 * v2.0 重构 — 从 lib/coordinator.ts 拆分
 *
 * 职责：
 * - 反思循环（最多 MAX_ITERATIONS 轮）
 * - 每轮：Reflect → 不满意则 Replan → 执行补充步骤 → KB 重建 → 再 Reflect
 * - 迭代 trace 记录（评委可视化用）
 *
 * 不参与：Planner 调用 / Locale 检测 / 最终 Export / Tool Use
 */

import { reflect, replan } from '@/lib/planner'
import { executePlan, runSingleAgent } from './executor'
import type {
  Plan,
  ExecutedStep,
  ReflectionResult,
  ReplanResult,
  ReflectionIteration,
  KnowledgeCard,
} from '@/types'
import type { CoordinatorStage } from './coordinator'
import type { CoordinatorInput } from './coordinator'
import type { Locale } from '@/lib/locale'

/**
 * 最多反思 2 轮（避免成本爆炸）
 */
export const MAX_ITERATIONS = 2

/**
 * 反思循环的输出
 */
export interface WorkflowResult {
  iterations: ReflectionIteration[]
  totalIterations: number
  finalReflection: ReflectionResult
  finalReflectionDurationMs: number
  /** 循环结束时的 results（可能已被补充步骤覆盖） */
  results: Record<string, any>
  /** 循环结束时的 execution（已合并补充步骤） */
  execution: ExecutedStep[]
  /** 循环结束时的 KB（最终的知识卡） */
  knowledgeCard: KnowledgeCard | null
}

/**
 * 运行反思循环
 *
 * @param plan — Planner 生成的初始 plan
 * @param initialExecution — 初始执行结果（executePlan 的输出）
 * @param initialResults — 初始 results（executePlan 的输出）
 * @param input — 用户输入
 * @param ctx — 语言上下文（sourceLocale / targetLocale / languageDirective）
 * @param onStage — 阶段进度回调（用于 SSE 推送）
 */
export async function runReflectionLoop(
  plan: Plan,
  initialExecution: ExecutedStep[],
  initialResults: Record<string, any>,
  input: CoordinatorInput,
  ctx: { sourceLocale: Locale; targetLocale: Locale; languageDirective: string },
  onStage?: (stage: CoordinatorStage) => void
): Promise<WorkflowResult> {
  let execution = [...initialExecution]
  let results = { ...initialResults }

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
    // ===== 3a. Reflect =====
    currentKnowledgeCard = extractKnowledgeCard(results, input)
    if (iter === 1) {
      onStage?.({ id: 4, label: 'Knowledge Card Built', detail: `KB 初始构建完成，进入反思` })
    }
    const reflectionStart = Date.now()
    if (iter === 1) {
      onStage?.({ id: 5, label: 'Reflection Loop', detail: `iteration ${iter}/${MAX_ITERATIONS}` })
    }
    const reflection = await reflect(
      plan,
      results,
      currentKnowledgeCard,
      ctx.languageDirective
    )
    const reflectionDurationMs = Date.now() - reflectionStart

    finalReflection = reflection
    finalReflectionDurationMs = reflectionDurationMs
    totalIterations = iter

    const iterationTrace: ReflectionIteration = {
      iteration: iter,
      reflection,
      reflection_duration_ms: reflectionDurationMs,
    }

    // ===== 3b. 如果 satisfied 或触顶，结束循环 =====
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

    // ===== 3c. Replan — 让 LLM 决定补调哪些 Agent =====
    const replanStart = Date.now()
    const replanResult = await replan(
      plan,
      reflection,
      execution,
      currentKnowledgeCard,
      iter,
      MAX_ITERATIONS,
      ctx.languageDirective
    )
    const replanDurationMs = Date.now() - replanStart
    iterationTrace.replan = replanResult
    iterationTrace.replan_duration_ms = replanDurationMs

    // ===== 3d. 如果 replan 说不用继续，结束 =====
    if (!replanResult.should_continue || replanResult.supplementary_steps.length === 0) {
      iterations.push(iterationTrace)
      break
    }

    // ===== 3e. 执行补充步骤（同步更新 results，让 KB 重建能用上新结果） =====
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
      ctx.sourceLocale,
      ctx.targetLocale,
      ctx.languageDirective
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

    // ===== 3f. 如果补充步骤里有 KnowledgeBuilder 重新跑了，下一轮 reflect 会看到新结果 =====
    // 如果没跑 KB，但 Analyzer/Terminology 重跑了，下一轮 KB 自动用新结果
    // 让 KB 在下次迭代时自动重建
    if (suppResults['KnowledgeBuilder']) {
      results['KnowledgeBuilder'] = suppResults['KnowledgeBuilder']
    } else if (suppResults['Analyzer'] || suppResults['Terminology'] || suppResults['Reader']) {
      // 自动触发 KB 重建
      const kbResult = await runSingleAgent('KnowledgeBuilder', {
        title: input.title,
        content: input.content,
        readerOutput: results['Reader'],
        analyzerOutput: results['Analyzer'],
        terminologyOutput: results['Terminology'],
      })
      if (kbResult.success && kbResult.data && !kbResult.data.error) {
        results['KnowledgeBuilder'] = kbResult.data
        execution.push({
          step: {
            id: `step-auto-kb-${iter}`,
            agent: 'KnowledgeBuilder',
            reason: `迭代 ${iter}：Analyzer/Terminology 重跑后自动重建知识卡`,
            parallel_group: 100 + iter,
            depends_on: replanResult.supplementary_steps.map(s => s.id),
            required: true,
          },
          success: kbResult.success,
          durationMs: kbResult.durationMs,
          output: kbResult.data,
          error: kbResult.error,
        })
      }
    }

    // 继续下一轮 reflection
  }

  return {
    iterations,
    totalIterations,
    finalReflection,
    finalReflectionDurationMs,
    results,
    execution,
    knowledgeCard: currentKnowledgeCard,
  }
}

// ============================================================================
// extractKnowledgeCard — 从 results 中提取 KB
// ============================================================================

/**
 * 从 results 中提取 KnowledgeCard — 兼容 KB 直接结果和需要重建的情况
 */
export function extractKnowledgeCard(
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

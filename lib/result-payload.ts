/**
 * v2.3.3 (C) — 共享 SSE 'result' payload 构造器
 *
 * 把 CoordinatorOutput 转换为 SSE 'result' 事件的 payload。
 * 被两处共用：
 *  - app/api/research/multi-agent-stream/route.ts：live 路径发完即用
 *  - app/api/tools/precompute-example/route.ts：缓存到 fixture
 *
 * 提取为共享函数的目的：保证「live 发出去的 payload」与「缓存存的 result
 * 字段」逐字段同构，回放时直接 send 即可，前端不会感知差异。
 *
 * 故意用 `any` 入参：避免在 lib 引入 @/... 路径依赖（lib 应保持纯 Node
 * 可加载，便于 verify 脚本相对 import 验证回放引擎）。调用方负责传入
 * 符合 CoordinatorOutput 形状的对象。
 */
import type { ResultPayload } from './example-cache'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildResultPayload(result: any, source: string): ResultPayload {
  return {
    success: true,
    knowledge_card: result.knowledgeCard,
    recommendations: result.recommendations,
    markdown: result.exports.markdown,
    obsidian: result.exports.obsidian,
    json: result.exports.json,
    mindmap: result.exports.mindmap,
    plan: result.plan,
    execution: result.execution.map((e: any) => ({
      step_id: e.step.id,
      agent: e.step.agent,
      reason: e.step.reason,
      parallel_group: e.step.parallel_group,
      required: e.step.required,
      success: e.success,
      duration_ms: e.durationMs,
      error: e.error,
    })),
    reflection: result.reflection,
    iterations: result.iterations,
    total_iterations: result.totalIterations,
    tool_calls: result.toolCalls.map((tc: any) => ({
      id: tc.id,
      tool: tc.tool,
      called_by: tc.calledBy,
      input: tc.input,
      success: tc.result.success,
      output: tc.result.output,
      error: tc.result.error,
      duration_ms: tc.result.durationMs,
    })),
    pipeline: result.pipeline,
    metadata: {
      total_duration_ms: result.totalDurationMs,
      planner_duration_ms: result.plannerDurationMs,
      reflection_duration_ms: result.reflectionDurationMs,
      tool_call_duration_ms: result.toolCallDurationMs,
      tool_calls_count: result.toolCalls.length,
      tool_calls_succeeded: result.toolCalls.filter((tc: any) => tc.result.success).length,
      agent_count: result.execution.length,
      steps_planned: result.plan.steps.length,
      steps_executed: result.execution.length,
      steps_succeeded: result.execution.filter((e: any) => e.success).length,
      reflection_satisfied: result.reflection.satisfied,
      reflection_iterations: result.totalIterations,
      supplementary_steps_executed: result.iterations.reduce(
        (acc: number, iter: any) => acc + (iter.supplementary_execution?.length || 0), 0
      ),
      input_type: result.plan.input_type,
      complexity: result.plan.complexity,
      source,
      // ===== D6 Cost & Token Dashboard =====
      total_tokens: result.totalUsage?.totalTokens ?? 0,
      total_prompt_tokens: result.totalUsage?.promptTokens ?? 0,
      total_completion_tokens: result.totalUsage?.completionTokens ?? 0,
      total_cost_usd: result.totalCostUsd ?? 0,
      per_agent_usage: result.perAgentUsage ?? [],
    },
  }
}

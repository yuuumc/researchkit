/**
 * v2.4.0 — agent_run MCP tool
 *
 * 把 core/agent-loop/runAgent 包装成 MCP 风格工具，外部 ASP / MCP 客户端可通过
 *   POST /api/tools/call  { tool: "agent_run", input: { goal, session_id?, max_steps? } }
 * 调用，无需直接打 /api/agent/run 的 SSE。
 *
 * 这是 v2.4.0 "从工具到 Agent 服务" 的关键接口：
 * - 旧的 web_search / arxiv 是叶子工具
 * - agent_run 是组合工具（内部会调用 web_search / arxiv / multi-agent）
 *
 * 注意：execute() 直接调 runAgent()（不走 HTTP），同进程，避免 self-call 循环。
 */

import type { Tool, ToolCallResult } from './types'

export const agentRunTool: Tool = {
  name: 'agent_run',
  description: `Run the v2.4.2 multi-step ResearchKit research agent.
The agent takes a research GOAL (not a single paper) and autonomously:
  1. Plans 2-6 steps (arxiv search / web search / multi-agent deep-dive / memory recall)
  2. Executes each step (using web_search, arxiv, or the full 6-agent pipeline)
  3. Synthesizes a final grounded answer with [1]/[2]/... inline citations

Input:
- goal: free-text research question/goal (5..2000 chars)
- session_id (optional): resume an existing session to reuse prior materials
- max_steps (optional, default 4, max 6): cap on decomposition depth
- locale (optional): output language hint

Output: { session_id, final_answer, references, steps[], total_cost_usd, total_duration_ms }
Same as /api/agent/run but synchronous (no SSE). For real-time progress, use the SSE endpoint.`,
  input_schema: {
    type: 'object',
    properties: {
      goal: {
        type: 'string',
        description: 'Research goal in natural language (5..2000 chars)',
      },
      session_id: {
        type: 'string',
        description: 'Optional: resume an existing session by id',
      },
      max_steps: {
        type: 'number',
        description: 'Optional: max decomposition steps (1..6, default 4)',
        default: 4,
      },
      locale: {
        type: 'string',
        description: 'Optional: output locale, e.g. "en" or "zh-CN"',
        enum: ['en', 'zh', 'zh-CN', 'en-US'],
      },
    },
    required: ['goal'],
  },
  async execute(input: Record<string, any>): Promise<ToolCallResult> {
    const start = Date.now()
    const goal = String(input?.goal || '').trim()
    if (goal.length < 5) {
      return {
        success: false,
        error: 'goal must be at least 5 chars',
        durationMs: Date.now() - start,
        toolName: 'agent_run',
      }
    }
    try {
      // 动态 import 避免循环依赖（tools/registry 已被本文件 import）
      const { runAgent } = await import('@/core/agent-loop')
      const result = await runAgent({
        goal,
        sessionId: input.session_id || undefined,
        maxSteps: typeof input.max_steps === 'number' ? input.max_steps : undefined,
      })
      return {
        success: true,
        output: {
          session_id: result.sessionId,
          final_answer: result.finalAnswer,
          references: result.references,
          steps: result.steps.map(s => ({
            id: s.id,
            index: s.index,
            kind: s.kind,
            rationale: s.rationale,
            status: s.status,
            outputSummary: s.outputSummary,
            durationMs: s.durationMs,
            costUsd: s.costUsd,
          })),
          total_cost_usd: result.totalCostUsd,
          total_duration_ms: result.totalDurationMs,
        },
        durationMs: Date.now() - start,
        toolName: 'agent_run',
        content: [
          { type: 'text', text: result.finalAnswer.slice(0, 4000) },
          { type: 'json', json: { session_id: result.sessionId, references: result.references, step_count: result.steps.length } },
        ],
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        toolName: 'agent_run',
      }
    }
  },
}

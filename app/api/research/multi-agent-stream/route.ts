/**
 * Multi-Agent Research Endpoint (SSE 版本)
 * POST /api/research/multi-agent-stream
 *
 * 用 Server-Sent Events 实时推送进度：
 * 1. coordinator 的 onStage 回调 → 推送 stage 事件
 * 2. coordinator 完成 → 推送 result 事件（完整结果）+ 关闭连接
 *
 * 前端用 EventSource 订阅，进度面板与真实后端执行严格同步
 */

import { NextRequest } from 'next/server'
import { coordinate } from '@/lib/coordinator'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder()

  try {
    const body = await request.json()
    const content = body.content || ''
    const title = body.title
    const source = body.source || '用户输入'

    if (!content || content.length < 50) {
      return new Response(
        `event: error\ndata: ${JSON.stringify({ error: '内容过短，请提供至少 50 字符' })}\n\n`,
        {
          status: 400,
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
        }
      )
    }

    if (content.length > 50000) {
      return new Response(
        `event: error\ndata: ${JSON.stringify({ error: '内容过长，最大支持 50000 字符' })}\n\n`,
        {
          status: 400,
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
        }
      )
    }

    // 创建 ReadableStream — SSE 必须用 stream 而不是一次性 response
    const stream = new ReadableStream({
      async start(controller) {
        const send = (eventName: string, data: unknown) => {
          try {
            const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`
            controller.enqueue(encoder.encode(payload))
          } catch (err) {
            console.error('SSE send failed:', err)
          }
        }

        try {
          const result = await coordinate({
            content,
            title,
            source,
            onStage: (stage) => {
              send('stage', stage)
            },
          })

          // ===== 完整性检查：检测所有 Agent 是否全部失败 =====
          // 如果 KB.title 是 Untitled 且 summary 为空 且 innovation 为空数组，
          // 说明 Reader/Analyzer/Terminology 全部失败（LLM 调用出错）
          const kc = result.knowledgeCard
          console.log('[multi-agent-stream] KB summary:', {
            title: kc.title,
            hasSummary: !!kc.summary,
            innovationCount: (kc.innovation || []).length,
            authorsCount: (kc.authors || []).length,
            field: kc.field,
            executionSuccessCount: result.execution.filter(e => e.success).length,
            executionTotalCount: result.execution.length,
            failedAgents: result.execution.filter(e => !e.success).map(e => e.step.agent),
          })

          const allAgentsFailed =
            (!kc.title || kc.title === 'Untitled') &&
            (!kc.summary || kc.summary.trim() === '') &&
            (!kc.innovation || kc.innovation.length === 0) &&
            (!kc.research_goals || kc.research_goals.length === 0)

          if (allAgentsFailed) {
            // 找到具体哪个 Agent 失败了，便于诊断
            const failedAgents = result.execution
              .filter(e => !e.success)
              .map(e => ({
                agent: e.step.agent,
                error: e.error || 'Unknown error',
              }))

            // 诊断 1：如果 execution 列表里只有 KB + Export（说明 Planner 返回了空 plan，
            // 直接走了"自动追加 KB/Export"分支，根本没调用 Reader/Analyzer/Terminology）
            const executedAgentNames = new Set(result.execution.map(e => e.step.agent))
            const coreAgentsMissing = !executedAgentNames.has('Reader') &&
              !executedAgentNames.has('Analyzer') &&
              !executedAgentNames.has('Terminology')

            let errorMsg: string
            if (failedAgents.length > 0) {
              errorMsg = `所有 Agent 调用失败：${failedAgents.map(f => `${f.agent}(${f.error.substring(0, 80)})`).join(', ')}。请检查 .env.local 中的 OPENAI_API_KEY、OPENAI_BASE_URL、LLM_MODEL 配置。`
            } else if (coreAgentsMissing) {
              // Planner 返回空 plan，没调用任何核心 Agent
              errorMsg = `Planner 未生成有效执行计划（核心 Agent 未被调用）。可能原因：LLM 限流、API key 无效、或网络中断。请检查 .env.local 中的 OPENAI_API_KEY、OPENAI_BASE_URL、LLM_MODEL 配置，稍后重试。`
            } else {
              errorMsg = '所有 Agent 调用失败，请检查 API key 和网络连接。'
            }

            console.error('All agents failed:', {
              failedAgents,
              executedAgents: Array.from(executedAgentNames),
              coreAgentsMissing,
              plannerDuration: result.plannerDurationMs,
              totalDuration: result.totalDurationMs,
              planRationale: result.plan.rationale,
            })

            send('error', { error: errorMsg })
            return  // 不调用 controller.close()，由 finally 统一关闭，避免双重 close 抛 TypeError
          }

          // 推送最终结果（与 /api/research/multi-agent 字段完全一致）
          send('result', {
            success: true,
            knowledge_card: result.knowledgeCard,
            recommendations: result.recommendations,
            markdown: result.exports.markdown,
            obsidian: result.exports.obsidian,
            json: result.exports.json,
            mindmap: result.exports.mindmap,
            plan: result.plan,
            execution: result.execution.map(e => ({
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
            tool_calls: result.toolCalls.map(tc => ({
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
              tool_calls_succeeded: result.toolCalls.filter(tc => tc.result.success).length,
              agent_count: result.execution.length,
              steps_planned: result.plan.steps.length,
              steps_executed: result.execution.length,
              steps_succeeded: result.execution.filter(e => e.success).length,
              reflection_satisfied: result.reflection.satisfied,
              reflection_iterations: result.totalIterations,
              supplementary_steps_executed: result.iterations.reduce(
                (acc, iter) => acc + (iter.supplementary_execution?.length || 0), 0
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
          })

          // 最终阶段：Done
          send('stage', { id: 7, label: 'Done' })
        } catch (err) {
          send('error', { error: err instanceof Error ? err.message : '服务器内部错误' })
        } finally {
          // 用 try/catch 保护 close()，避免流已关闭时抛 TypeError（allAgentsFailed 提前 return 的场景）
          try { controller.close() } catch {}
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // nginx 不缓冲
      },
    })
  } catch (error) {
    console.error('SSE endpoint 错误:', error)
    return new Response(
      `event: error\ndata: ${JSON.stringify({ error: '服务器内部错误' })}\n\n`,
      {
        status: 500,
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
      }
    )
  }
}

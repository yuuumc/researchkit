/**
 * Multi-Agent Research Endpoint
 * POST /api/research/multi-agent
 *
 * Plan-driven + Reflection 协调器：
 * 1. Planner LLM 看输入，输出执行计划
 * 2. Coordinator 按 Plan 执行（同 group 并行）
 * 3. Reflection LLM 反思结果质量
 * 4. 返回完整 trace（plan + execution + reflection）+ knowledge_card
 */

import { NextRequest, NextResponse } from 'next/server'
import { coordinate } from '@/lib/coordinator'

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // D41 诊断增强：先拿 raw text 再手动 JSON.parse（同 SSE 端点）
    const rawBody = await request.text()
    let body: { content?: string; title?: string; source?: string }
    try {
      body = JSON.parse(rawBody)
    } catch (parseErr) {
      console.error('[multi-agent] JSON.parse 失败:', {
        bodyLength: rawBody.length,
        bodyPreview: rawBody.substring(0, 500),
        contentType: request.headers.get('content-type'),
        errMessage: parseErr instanceof Error ? parseErr.message : String(parseErr),
      })
      return NextResponse.json(
        {
          success: false,
          error: `请求体不是合法 JSON（${parseErr instanceof Error ? parseErr.message : 'parse error'}）`,
          debug: {
            contentType: request.headers.get('content-type'),
            bodyLength: rawBody.length,
            bodyPreview: rawBody.substring(0, 200),
          },
        },
        { status: 400 }
      )
    }
    const content = body.content || ''
    const title = body.title
    const source = body.source || '用户输入'

    if (!content || content.length < 50) {
      return NextResponse.json(
        { success: false, error: '内容过短，请提供至少 50 字符' },
        { status: 400 }
      )
    }

    if (content.length > 50000) {
      return NextResponse.json(
        { success: false, error: '内容过长，最大支持 50000 字符' },
        { status: 400 }
      )
    }

    // 调用 LLM-driven 协调器
    const result = await coordinate({
      content,
      title,
      source,
    })

    return NextResponse.json({
      success: true,
      knowledge_card: result.knowledgeCard,
      recommendations: result.recommendations,
      markdown: result.exports.markdown,
      obsidian: result.exports.obsidian,
      json: result.exports.json,
      mindmap: result.exports.mindmap,
      // Agent 化的关键证据 — 评委可视化用
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
      // 反思循环的完整 trace（评委证据 — Agent 真正能反思 + 补救）
      iterations: result.iterations,
      total_iterations: result.totalIterations,
      // MCP 工具调用 trace（评委证据 — Agent 真正调用工具）
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
      // 向后兼容字段
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
      },
    })
  } catch (error) {
    console.error('Multi-Agent API 错误:', error)
    const errMsg = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      {
        success: false,
        error: `服务器内部错误：${errMsg}`,
        debug: {
          name: error instanceof Error ? error.name : 'Unknown',
          stack: error instanceof Error ? error.stack?.substring(0, 500) : undefined,
        },
      },
      { status: 500 }
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}

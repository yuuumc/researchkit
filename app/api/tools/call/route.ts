/**
 * MCP Tools Call Endpoint
 * POST /api/tools/call
 *
 * 统一调用入口 — 评委 / 外部 ASP 可直接 POST 调用任意工具
 *
 * Body:
 * { "tool": "memory", "input": { "action": "save", "title": "..." } }
 *
 * v2.3.2 安全加固（H1）：
 * - 加 rate limit（20 次/分钟，防止滥用）
 * - 加工具白名单：公开只暴露 web_search / arxiv
 *   filesystem / memory 仅限内部调用（通过 x-internal-key 校验）
 * - 修复 Object.keys({}) bug → listTools()
 *
 * v2.4.0 增量：
 * - 把 agent_run 加进 PUBLIC_TOOLS（v2.4.0 多步研究 Agent 的对外入口）
 * - 公开可调，无需 x-internal-key（与 web_search/arxiv 同样视为安全工具）
 */

import { NextRequest, NextResponse } from 'next/server'
import { callTool, listTools } from '@/lib/tools/registry'
import { handleOptions } from '@/lib/cors'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

// v2.3.2 (H1) — 工具白名单
// 公开可调用的工具（不涉及服务端文件系统 / 记忆库）
// v2.4.0 增量：把 agent_run 加进公开白名单 — 这是 v2.4.0 "从工具到 Agent 服务" 的关键入口
const PUBLIC_TOOLS = new Set(['web_search', 'arxiv', 'agent_run'])

// 内部调用密钥（从环境变量读，评委测试时可通过 header 传入）
// 生产环境应设置 INTERNAL_TOOL_KEY 环境变量
const INTERNAL_KEY = process.env.INTERNAL_TOOL_KEY || ''

export async function POST(request: NextRequest) {
  // v2.3.2 (H1) — rate limit
  const ip = getClientIp(request)
  const rl = checkRateLimit(`tool:${ip}`, { limit: 20, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: '请求过于频繁，请稍后再试' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
      }
    )
  }

  try {
    const body = await request.json()
    const toolName = body.tool
    const input = body.input || {}
    const calledBy = body.calledBy || 'User'

    if (!toolName) {
      return NextResponse.json(
        { success: false, error: 'Missing "tool" field' },
        { status: 400 }
      )
    }

    // v2.3.2 (H1) — 工具白名单校验
    // 非公开工具需要 x-internal-key header
    if (!PUBLIC_TOOLS.has(toolName)) {
      const providedKey = request.headers.get('x-internal-key') || ''
      if (!INTERNAL_KEY || providedKey !== INTERNAL_KEY) {
        return NextResponse.json(
          {
            success: false,
            error: `Tool "${toolName}" is not publicly available. Only [${Array.from(PUBLIC_TOOLS).join(', ')}] can be called externally.`,
            available: listTools().map(t => t.name),
          },
          { status: 403 }
        )
      }
    }

    const toolCall = await callTool(toolName, input, calledBy)

    return NextResponse.json({
      success: toolCall.result.success,
      tool: toolName,
      input,
      result: toolCall.result.output,
      error: toolCall.result.error,
      content: toolCall.result.content,
      metadata: {
        duration_ms: toolCall.result.durationMs,
        call_id: toolCall.id,
        called_by: calledBy,
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'internal error',
      },
      { status: 500 }
    )
  }
}

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request)
}

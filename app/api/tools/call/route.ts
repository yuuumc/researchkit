/**
 * MCP Tools Call Endpoint
 * POST /api/tools/call
 *
 * 统一调用入口 — 评委 / 外部 ASP 可直接 POST 调用任意工具
 *
 * Body:
 * { "tool": "memory", "input": { "action": "save", "title": "..." } }
 */

import { NextRequest, NextResponse } from 'next/server'
import { callTool, getTool } from '@/lib/tools/registry'

export async function POST(request: NextRequest) {
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

    const tool = getTool(toolName)
    if (!tool) {
      return NextResponse.json(
        { success: false, error: `Tool not found: ${toolName}`, available: Object.keys({}) },
        { status: 404 }
      )
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
        error: error instanceof Error ? error.message : 'Internal error',
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
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

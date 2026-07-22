/**
 * MCP Tools List Endpoint
 * GET /api/tools/list
 *
 * 返回所有已注册的 MCP 工具清单（不含 execute 函数）
 * 用于：LLM 函数调用 / UI 可视化 / 外部 ASP 调用
 */

import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import { listTools } from '@/lib/tools/registry'
import { handleOptions } from '@/lib/cors'

export async function GET() {
  const tools = listTools()
  return NextResponse.json({
    success: true,
    tools,
    count: tools.length,
    protocol: 'mcp-style',
    version: '1.0',
  })
}

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request)
}

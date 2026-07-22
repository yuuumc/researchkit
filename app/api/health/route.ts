/**
 * 健康检查 + 版本信息
 * GET /api/health
 */

import { NextResponse } from 'next/server'
import { listTools } from '@/lib/tools/registry'

export async function GET() {
  const tools = listTools()
  return NextResponse.json({
    success: true,
    service: 'ResearchKit',
    version: '2.3.1',
    timestamp: new Date().toISOString(),
    architecture: 'multi-agent-mcp-reflection-loop',
    agents: [
      { name: 'Planner', role: 'LLM-driven 自主规划' },
      { name: 'Reader', role: '阅读理解' },
      { name: 'Analyzer', role: '深度分析' },
      { name: 'Terminology', role: '术语提取' },
      { name: 'KnowledgeBuilder', role: '汇总构建' },
      { name: 'Recommendation', role: '相关阅读推荐' },
      { name: 'Export', role: '多格式导出' },
      { name: 'Reflection', role: '结果反思' },
      { name: 'Replan', role: '反思失败后补调决策' },
    ],
    mcp_tools: tools.map(t => ({
      name: t.name,
      description: t.description.split('\n')[0],
    })),
    endpoints: [
      'POST /api/research/multi-agent (Plan-driven + Reflection + Tools)',
      'POST /api/research/knowledge-card (single-LLM)',
      'POST /api/research/upload-pdf',
      'POST /api/research/batch',
      'GET  /api/tools/list (MCP tools registry)',
      'POST /api/tools/call (call any MCP tool)',
    ],
  })
}

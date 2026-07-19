/**
 * 健康检查 + 版本信息
 * GET /api/health
 */

import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    success: true,
    service: 'ResearchKit',
    version: '0.3.0',
    timestamp: new Date().toISOString(),
    features: ['text', 'url', 'pdf', 'markdown-export'],
  })
}

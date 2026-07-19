/**
 * ResearchKit 核心 API Endpoint
 * POST /api/research/knowledge-card
 *
 * 输入：论文/文档内容
 * 输出：结构化知识卡
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateKnowledgeCard } from '@/lib/llm'

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // 解析请求体
    const body = await request.json()

    // 验证必填字段
    if (!body.content || typeof body.content !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: '缺少必填字段: content',
        },
        { status: 400 }
      )
    }

    // 验证内容长度（防止过长的输入）
    const MAX_CONTENT_LENGTH = 50000 // 约 50k 字符
    if (body.content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          error: `内容过长，最大支持 ${MAX_CONTENT_LENGTH} 字符`,
        },
        { status: 400 }
      )
    }

    // 提取参数
    const content = body.content
    const language = body.options?.language || 'zh'
    const detailLevel = body.options?.detail_level || 'standard'

    // 调用 LLM 生成知识卡
    const knowledgeCard = await generateKnowledgeCard({
      content,
      language,
      detailLevel,
    })

    const processingTimeMs = Date.now() - startTime

    // 返回成功响应
    return NextResponse.json({
      success: true,
      knowledge_card: knowledgeCard,
      metadata: {
        word_count: content.length,
        processing_time_ms: processingTimeMs,
      },
    })
  } catch (error) {
    console.error('API 错误:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '服务器内部错误',
      },
      { status: 500 }
    )
  }
}

// 处理 OPTIONS 请求（CORS 预检）
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
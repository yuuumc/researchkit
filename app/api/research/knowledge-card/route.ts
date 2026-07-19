/**
 * ResearchKit 核心 API Endpoint
 * POST /api/research/knowledge-card
 *
 * 输入：论文/文档内容、URL 或 PDF
 * 输出：结构化知识卡
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateKnowledgeCard } from '@/lib/llm'
import { parseContent, exportToMarkdown } from '@/lib/parser'

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await request.json()

    // 支持多种输入模式
    const inputType = body.input_type || 'text' // 'text' | 'url'
    const rawInput = body.content || body.url || ''
    const options = body.options || {}
    const exportFormat = body.export_format // 'markdown' | undefined

    if (!rawInput || typeof rawInput !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: '缺少必填字段: content 或 url',
        },
        { status: 400 }
      )
    }

    // 解析输入内容（支持 URL 抓取）
    let parsed
    try {
      parsed = await parseContent(rawInput, inputType)
    } catch (parseError) {
      return NextResponse.json(
        {
          success: false,
          error: `内容解析失败: ${parseError instanceof Error ? parseError.message : '未知错误'}`,
        },
        { status: 400 }
      )
    }

    const content = parsed.content

    // 验证内容长度
    if (!content || content.length < 50) {
      return NextResponse.json(
        {
          success: false,
          error: '内容过短，请提供至少 50 字符的论文或文档内容',
        },
        { status: 400 }
      )
    }

    const MAX_CONTENT_LENGTH = 50000
    if (content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          error: `内容过长，最大支持 ${MAX_CONTENT_LENGTH} 字符`,
        },
        { status: 400 }
      )
    }

    const language = options.language || 'zh'
    const detailLevel = options.detail_level || 'standard'

    // 调用 LLM 生成知识卡
    const knowledgeCard = await generateKnowledgeCard({
      content,
      language,
      detailLevel,
    })

    // 如果 URL 模式抓到了 title，覆盖 LLM 生成的 title
    if (parsed.title && parsed.title.length > 0) {
      knowledgeCard.title = parsed.title
    }

    const processingTimeMs = Date.now() - startTime

    // 始终生成 markdown（不管 export_format 是否传入）
    const markdown = exportToMarkdown(knowledgeCard, parsed.source)

    return NextResponse.json({
      success: true,
      knowledge_card: knowledgeCard,
      markdown,
      metadata: {
        word_count: content.length,
        processing_time_ms: processingTimeMs,
        source: parsed.source,
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

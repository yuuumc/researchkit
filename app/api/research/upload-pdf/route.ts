/**
 * PDF 上传 Endpoint
 * POST /api/research/upload-pdf
 *
 * 接收 PDF 文件，解析后生成知识卡
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateKnowledgeCard } from '@/lib/llm'
import { parsePdf, exportToMarkdown } from '@/lib/parser'

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const language = ((formData.get('language') as string) || 'zh') as 'zh' | 'en'
    const detailLevel = ((formData.get('detail_level') as string) || 'standard') as 'brief' | 'standard' | 'detailed'
    const exportFormat = formData.get('export_format') as string

    if (!file) {
      return NextResponse.json(
        { success: false, error: '未找到 PDF 文件' },
        { status: 400 }
      )
    }

    // 验证文件类型
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      return NextResponse.json(
        { success: false, error: '只支持 PDF 文件' },
        { status: 400 }
      )
    }

    // 验证文件大小（10MB 上限）
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: '文件过大，最大支持 10MB' },
        { status: 400 }
      )
    }

    // 解析 PDF
    let parsed
    try {
      parsed = await parsePdf(file)
    } catch (parseError) {
      return NextResponse.json(
        {
          success: false,
          error: `PDF 解析失败: ${parseError instanceof Error ? parseError.message : '未知错误'}`,
        },
        { status: 400 }
      )
    }

    const content = parsed.content

    if (!content || content.length < 50) {
      return NextResponse.json(
        {
          success: false,
          error: 'PDF 内容过短或为空（可能是扫描件，请尝试文本输入）',
        },
        { status: 400 }
      )
    }

    // 截取前 50000 字符
    const truncatedContent = content.length > 50000
      ? content.substring(0, 50000) + '...'
      : content

    // 调用 LLM 生成知识卡
    const knowledgeCard = await generateKnowledgeCard({
      content: truncatedContent,
      language,
      detailLevel,
    })

    // 如果 PDF 元数据有 title，覆盖
    if (parsed.title && parsed.title.length > 0) {
      knowledgeCard.title = parsed.title
    }

    const processingTimeMs = Date.now() - startTime

    // 始终生成 markdown
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
    console.error('PDF API 错误:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '服务器内部错误',
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

/**
 * PDF 上传 Endpoint
 * POST /api/research/upload-pdf
 *
 * 接收 PDF 文件，解析后生成知识卡
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateKnowledgeCard } from '@/lib/llm'
import { parsePdf, exportToMarkdown, exportToObsidian, exportToMindmap } from '@/lib/parser'
import { handleOptions } from '@/lib/cors'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { getServerUserPreferences } from '@/lib/server-user-preferences'
import { beginCollection, endCollection } from '@/lib/usage-collector'
import { getServerProvider } from '@/lib/server-provider'
// D43 — magic numbers 集中到 config/orchestration.ts
import { MAX_PDF_SIZE_BYTES, RATE_LIMIT_PDF } from '@/config/orchestration'

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // P1-8 rate limit（PDF 解析最贵）
    const ip = getClientIp(request)
    const rl = checkRateLimit(`pdf:${ip}`, RATE_LIMIT_PDF)
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'PDF 上传过于频繁，请稍后再试' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
        }
      )
    }

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

    // P1-6 magic bytes 校验：检查文件头是否为 PDF 签名 %PDF-
    // 防止把 .exe / .html 等文件改名成 .pdf 上传
    const headerBuffer = await file.slice(0, 5).arrayBuffer()
    const header = new Uint8Array(headerBuffer)
    const isPdf = header[0] === 0x25 && // %
      header[1] === 0x50 && // P
      header[2] === 0x44 && // D
      header[3] === 0x46 && // F
      header[4] === 0x2d    // -
    if (!isPdf) {
      return NextResponse.json(
        { success: false, error: '文件内容不是有效 PDF（magic bytes 不匹配）' },
        { status: 400 }
      )
    }

    // 验证文件大小（MAX_PDF_SIZE_BYTES 上限）
    if (file.size > MAX_PDF_SIZE_BYTES) {
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

    // v2.3.3 fix — 包 beginCollection/endCollection,让 PDF 模式也记录 cost
    const collector = beginCollection()
    let knowledgeCard
    try {
      knowledgeCard = await generateKnowledgeCard({
        content: truncatedContent,
        language,
        // v2.3.3 fix — 传 outputLocale 让用户选的 Output Language 在 PDF 模式也生效
        outputLocale: getServerUserPreferences().outputLocale,
        detailLevel,
      })
    } finally {
      endCollection()
    }
    const usageSummary = collector.summarize()

    // 如果 PDF 元数据有 title，覆盖
    if (parsed.title && parsed.title.length > 0) {
      knowledgeCard.title = parsed.title
    }

    const processingTimeMs = Date.now() - startTime

    // 同时生成 Markdown 和 Obsidian 双链格式
    const markdown = exportToMarkdown(knowledgeCard, parsed.source)
    const obsidian = exportToObsidian(knowledgeCard, parsed.source)
    const mindmap = exportToMindmap(knowledgeCard)

    return NextResponse.json({
      success: true,
      knowledge_card: knowledgeCard,
      markdown,
      obsidian,
      mindmap,
      metadata: {
        word_count: content.length,
        processing_time_ms: processingTimeMs,
        source: parsed.source,
        // v2.3.3 fix — 透传 cost 数据给前端写 cost history
        total_tokens: usageSummary.totalUsage.totalTokens,
        total_prompt_tokens: usageSummary.totalUsage.promptTokens,
        total_completion_tokens: usageSummary.totalUsage.completionTokens,
        total_cost_usd: usageSummary.totalCostUsd,
        per_agent_usage: usageSummary.perAgent,
        model: getServerProvider().displayName,
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

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request)
}

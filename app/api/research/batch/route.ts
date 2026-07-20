/**
 * 批量处理 Endpoint
 * POST /api/research/batch
 *
 * 一次提交多个 URL，并发生成多张知识卡
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateKnowledgeCard } from '@/lib/llm'
import { fetchFromUrl, exportToMarkdown, exportToObsidian } from '@/lib/parser'

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await request.json()
    const urls: string[] = body.urls || []
    const concurrency = Math.min(body.concurrency || 3, 5) // 最多 5 并发

    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { success: false, error: '缺少 urls 数组' },
        { status: 400 }
      )
    }

    if (urls.length > 10) {
      return NextResponse.json(
        { success: false, error: '单次最多 10 个 URL' },
        { status: 400 }
      )
    }

    // arXiv URL 串行处理（API 限流严格，并发必触发 429）
    // 其他 URL 走原并发逻辑
    const isArxiv = (u: string) => /arxiv\.org\/abs\//.test(u)
    const arxivUrls = urls.filter(isArxiv)
    const otherUrls = urls.filter(u => !isArxiv(u))
    const arxivConcurrency = arxivUrls.length > 0 ? 1 : concurrency

    // 处理单个 URL 的完整流程
    const processOne = async (url: string) => {
      try {
        const parsed = await fetchFromUrl(url)

        if (!parsed.content || parsed.content.length < 50) {
          return {
            url,
            success: false,
            error: '内容过短或为空',
          }
        }

        const truncated = parsed.content.length > 50000
          ? parsed.content.substring(0, 50000) + '...'
          : parsed.content

        const knowledgeCard = await generateKnowledgeCard({
          content: truncated,
          language: 'zh',
          detailLevel: 'standard', // brief(1200) 会被截断导致 JSON 不完整，standard(2500) 才够完整 schema
        })

        if (parsed.title && parsed.title.length > 0) {
          knowledgeCard.title = parsed.title
        }

        const markdown = exportToMarkdown(knowledgeCard, parsed.source)
        const obsidian = exportToObsidian(knowledgeCard, parsed.source)

        return {
          url,
          success: true,
          knowledge_card: knowledgeCard,
          markdown,
          obsidian,
        }
      } catch (err) {
        return {
          url,
          success: false,
          error: err instanceof Error ? err.message : '处理失败',
        }
      }
    }

    // 分两组处理：arXiv URL 串行（避免触发 API 限流），其他 URL 走并发
    // 结果按原始 urls 顺序排列（用 Map 暂存）
    const resultMap = new Map<string, any>()

    // 串行处理 arXiv URL
    for (const url of arxivUrls) {
      resultMap.set(url, await processOne(url))
    }

    // 并发处理其他 URL
    const otherQueue = [...otherUrls]
    const otherWorkers: Promise<void>[] = []
    const otherWorker = async () => {
      while (otherQueue.length > 0) {
        const url = otherQueue.shift()
        if (!url) break
        resultMap.set(url, await processOne(url))
      }
    }
    for (let i = 0; i < concurrency; i++) {
      otherWorkers.push(otherWorker())
    }
    await Promise.all(otherWorkers)

    // 按原始顺序输出
    const results = urls.map(u => resultMap.get(u)).filter(Boolean)
    const successCount = results.filter(r => r.success).length
    const processingTimeMs = Date.now() - startTime

    return NextResponse.json({
      success: true,
      total: urls.length,
      succeeded: successCount,
      failed: urls.length - successCount,
      results,
      metadata: {
        concurrency,
        arxiv_count: arxivUrls.length,
        other_count: otherUrls.length,
        processing_time_ms: processingTimeMs,
      },
    })
  } catch (error) {
    console.error('Batch API 错误:', error)
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

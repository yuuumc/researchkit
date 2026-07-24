/**
 * 批量处理 Endpoint
 * POST /api/research/batch
 *
 * 一次提交多个 URL，并发生成多张知识卡
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateKnowledgeCard } from '@/lib/llm'
import { fetchFromUrl, exportToMarkdown, exportToObsidian } from '@/lib/parser'
import { handleOptions } from '@/lib/cors'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { getServerUserPreferences } from '@/lib/server-user-preferences'
import { beginCollection, endCollection, withAgent } from '@/lib/usage-collector'
import { getServerProvider } from '@/lib/server-provider'
// D43 — magic numbers 集中到 config/orchestration.ts
import { RATE_LIMIT_BATCH } from '@/config/orchestration'

// v2.3.3 fix — 包 beginCollection/endCollection,让 batch 模式也记录 cost
// 每个 URL 用 withAgent(`batch:${url}`) 隔离 agentName,实现 per-URL 归因
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // P1-8 rate limit（batch 模式最贵）
    const ip = getClientIp(request)
    const rl = checkRateLimit(`batch:${ip}`, RATE_LIMIT_BATCH)
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: '批量请求过于频繁，请稍后再试' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
        }
      )
    }
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

    // v2.3.3 fix — 顶层 collector,聚合所有 URL 的 cost
    const collector = beginCollection()
    try {
      // arXiv URL 串行处理（API 限流严格，并发必触发 429）
      // 其他 URL 走原并发逻辑
      const isArxiv = (u: string) => /arxiv\.org\/abs\//.test(u)
      const arxivUrls = urls.filter(isArxiv)
      const otherUrls = urls.filter(u => !isArxiv(u))
      const arxivConcurrency = arxivUrls.length > 0 ? 1 : concurrency

      // 处理单个 URL 的完整流程
      // v2.3.3 fix — 通过 withAgent(`batch:${url}`) 给每个 URL 一个独立 agentName
      // 所有 LLM 调用会被归到该 agentName 下,实现 per-URL cost 归因
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
            // v2.3.3 fix — 传 outputLocale 让用户选的 Output Language 在 batch 模式也生效
            outputLocale: getServerUserPreferences().outputLocale,
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

      // 串行处理 arXiv URL — 每个 URL 用 withAgent 隔离 agentName
      for (const url of arxivUrls) {
        resultMap.set(url, await withAgent(`batch:${url}`, () => processOne(url)))
      }

      // 并发处理其他 URL — withAgent 使用 usageAls.run() 创建子上下文,并行互不干扰
      const otherQueue = [...otherUrls]
      const otherWorkers: Promise<void>[] = []
      const otherWorker = async () => {
        while (otherQueue.length > 0) {
          const url = otherQueue.shift()
          if (!url) break
          resultMap.set(url, await withAgent(`batch:${url}`, () => processOne(url)))
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

      // v2.3.3 fix — 聚合 cost metadata
      const usageSummary = collector.summarize()

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
          // v2.3.3 fix — 透传 cost 数据给前端写 cost history
          total_tokens: usageSummary.totalUsage.totalTokens,
          total_prompt_tokens: usageSummary.totalUsage.promptTokens,
          total_completion_tokens: usageSummary.totalUsage.completionTokens,
          total_cost_usd: usageSummary.totalCostUsd,
          per_agent_usage: usageSummary.perAgent,
          model: getServerProvider().displayName,
        },
      })
    } finally {
      endCollection()
    }
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

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request)
}

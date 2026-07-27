/**
 * x402 Service — Literature Search
 *
 * POST /api/x402/literature-search
 * Body: { query: string, max_results?: number }
 * Response: { papers: ArxivEntry[], count }
 *
 * 业务：通过 MCP 工具注册表调用 arxiv，返回相关论文列表。
 * 风险：arxiv API 不可达 / 工具内 fetch 无超时 → 用 Promise.race 20s 强制超时，不兜底 200。
 */

import { NextResponse } from 'next/server'
import { withX402 } from '@/lib/x402/gate'
import { BusinessError } from '@/lib/x402/run-paid'
import { callTool } from '@/lib/tools/registry'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const ARXIV_TIMEOUT_MS = 20_000
const MAX_RESULTS_CAP = 10
const MAX_RESULTS_DEFAULT = 10

interface ArxivEntry {
  title: string
  authors: string[]
  summary: string
  arxivId: string
  url: string
  published: string
  categories: string[]
}

const { GET, POST, OPTIONS } = withX402(
  { priceUsd: 0.005, description: 'Literature search service (arXiv)' },
  async (body) => {
    const query = body?.query
    if (typeof query !== 'string' || query.trim().length === 0) {
      throw new BusinessError(400, 'invalid_input', 'query (non-empty string) is required')
    }

    const requested = typeof body.max_results === 'number'
      ? Math.min(Math.max(1, Math.floor(body.max_results)), MAX_RESULTS_CAP)
      : MAX_RESULTS_DEFAULT

    // Promise.race：arxiv 调用超过 20s → 502，不静默降级
    const toolCallPromise = callTool('arxiv', {
      action: 'search',
      query: query.trim(),
      maxResults: requested,
    })

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new BusinessError(502, 'upstream_timeout', `arxiv search exceeded ${ARXIV_TIMEOUT_MS}ms`)),
        ARXIV_TIMEOUT_MS
      )
    })

    let toolCall
    try {
      toolCall = await Promise.race([toolCallPromise, timeoutPromise])
    } catch (e) {
      if (e instanceof BusinessError) throw e
      throw new BusinessError(502, 'upstream', `arxiv search failed: ${e instanceof Error ? e.message : String(e)}`)
    }

    const result = toolCall?.result
    if (!result || result.success === false) {
      throw new BusinessError(502, 'upstream', `arxiv tool failed: ${result?.error || 'unknown error'}`)
    }

    const entries: ArxivEntry[] = Array.isArray(result.output?.entries) ? result.output.entries : []
    const papers = entries.map(e => ({
      title: e.title,
      authors: e.authors,
      abstract: e.summary,
      arxiv_id: e.arxivId,
      url: e.url,
      published: e.published,
      categories: e.categories,
    }))

    return NextResponse.json({
      papers,
      count: papers.length,
      query,
    })
  }
)

export { GET, POST, OPTIONS }

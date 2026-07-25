/**
 * Web Search Tool — Wikipedia OpenSearch + Full-text + DuckDuckGo HTML 三级兜底
 *
 * MCP-style：标准化 input_schema + execute
 * 主搜索源：  Wikipedia OpenSearch API（免费、无反爬虫、稳定）
 * 兜底 1：   Wikipedia 全文搜索（解决 OpenSearch 标题前缀匹配的盲区）
 * 兜底 2：   拆关键词分别搜索合并去重
 * 兜底 3：   长句提炼关键词 join 重试
 * 兜底 4：   DuckDuckGo HTML（可能被反爬虫挡）
 *
 * v2.4.2 修复：OpenSearch 只做标题前缀匹配，"transformer attention" 返回空，
 * 导致 Agent Planner web step 全空 → Synthesizer 收到空 step results → "no information retrieved"。
 * 加入全文搜索 + 逐个关键词搜索作为兜底。
 */

import { Tool } from './types'

interface SearchResult {
  title: string
  url: string
  snippet: string
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** 主搜索源：Wikipedia OpenSearch + Summary API（完全免费、无反爬虫、对百科/定义类查询完美） */
async function searchViaWikipedia(query: string, maxResults: number): Promise<SearchResult[]> {
  // 检测语言：中文用 zh.wikipedia.org，否则用 en.wikipedia.org
  const isChinese = /[\u4e00-\u9fa5]/.test(query)
  const lang = isChinese ? 'zh' : 'en'
  const opensearchUrl = `https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=${maxResults}&format=json&origin=*`

  const osResponse = await fetch(opensearchUrl, {
    headers: { 'Accept': 'application/json' },
  })
  if (!osResponse.ok) return []

  // OpenSearch 返回：[query, [titles], [descriptions], [urls]]
  const osData: any = await osResponse.json()
  const titles: string[] = Array.isArray(osData?.[1]) ? osData[1] : []
  const descriptions: string[] = Array.isArray(osData?.[2]) ? osData[2] : []
  const urls: string[] = Array.isArray(osData?.[3]) ? osData[3] : []
  if (titles.length === 0) return []

  // 对前 3 条拉 summary（提升 snippet 质量）
  const topCount = Math.min(3, titles.length)
  const enriched = await Promise.all(
    titles.slice(0, topCount).map(async (title, i) => {
      let snippet = descriptions[i] || ''
      try {
        const sumUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
        const sumResp = await fetch(sumUrl, { headers: { 'Accept': 'application/json' } })
        if (sumResp.ok) {
          const sumData: any = await sumResp.json()
          if (sumData?.extract && typeof sumData.extract === 'string') {
            snippet = sumData.extract.slice(0, 500)
          }
        }
      } catch {
        // 保留 OpenSearch 的 description 作为 fallback
      }
      return {
        title,
        url: urls[i] || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
        snippet,
      }
    })
  )

  // 剩余的只取 title + description + url（不调 summary，避免太多请求）
  const rest: SearchResult[] = titles.slice(topCount).map((title, i) => ({
    title,
    url: urls[topCount + i] || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    snippet: descriptions[topCount + i] || '',
  }))

  return [...enriched, ...rest]
}

/** v2.4.2 新增：Wikipedia 全文搜索（action=query&list=search）。
 *  OpenSearch 只做标题前缀匹配，"transformer attention" 返回空，
 *  全文搜索能找到 Attention (machine learning) 等语义相关页面。 */
async function searchViaWikipediaFullText(query: string, maxResults: number): Promise<SearchResult[]> {
  const isChinese = /[一-龥]/.test(query)
  const lang = isChinese ? 'zh' : 'en'
  const apiUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${maxResults}&format=json&origin=*`

  try {
    const resp = await fetch(apiUrl, { headers: { 'Accept': 'application/json' } })
    if (!resp.ok) return []
    const data: any = await resp.json()
    const pages: any[] = data?.query?.search || []
    if (pages.length === 0) return []

    return pages.slice(0, maxResults).map((p: any) => ({
      title: p.title || '',
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title || '')}`,
      snippet: (p.snippet || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').trim(),
    }))
  } catch {
    return []
  }
}

/** v2.4.2 新增：把复合查询拆成单个关键词分别搜 Wikipedia OpenSearch，合并去重。
 *  "transformer attention mechanism" → 分别搜 transformer / attention / mechanism → 去重 */
async function searchViaIndividualKeywords(query: string, maxResults: number): Promise<SearchResult[]> {
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (words.length <= 1) return []

  const allResults: SearchResult[] = []
  const seen = new Set<string>()

  for (const word of words) {
    if (allResults.length >= maxResults) break
    const batch = await searchViaWikipedia(word, Math.ceil(maxResults / 2))
    for (const r of batch) {
      const key = r.url || r.title
      if (seen.has(key)) continue
      seen.add(key)
      allResults.push(r)
    }
  }

  return allResults.slice(0, maxResults)
}

/** 兜底源：DuckDuckGo HTML（被反爬虫挡时返回空数组，不再作为主源） */
async function searchViaDuckDuckGo(query: string, maxResults: number): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })
  if (!response.ok) return []

  const html = await response.text()
  // 反爬虫挑战页面检测
  if (html.includes('anomaly-modal') || html.includes('bots use DuckDuckGo')) {
    return []
  }

  const results: SearchResult[] = []
  const resultRegex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g
  let match
  while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
    let rawUrl = match[1]
    const uddgMatch = rawUrl.match(/uddg=([^&]+)/)
    if (uddgMatch) rawUrl = decodeURIComponent(uddgMatch[1])
    results.push({
      title: stripHtml(match[2]),
      url: rawUrl,
      snippet: stripHtml(match[3]),
    })
  }

  if (results.length === 0) {
    const titleRegex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
    while ((match = titleRegex.exec(html)) !== null && results.length < maxResults) {
      let rawUrl = match[1]
      const uddgMatch = rawUrl.match(/uddg=([^&]+)/)
      if (uddgMatch) rawUrl = decodeURIComponent(uddgMatch[1])
      results.push({ title: stripHtml(match[2]), url: rawUrl, snippet: '' })
    }
  }
  return results
}

export const webSearchTool: Tool = {
  name: 'web_search',
  description: `Search the web via Wikipedia OpenSearch API (primary, stable, no API key) + DuckDuckGo HTML (fallback).

Actions:
- "search": Web search (returns top results with title, url, snippet)

Use this tool when you need to find:
1. Definitions or encyclopedic knowledge about a concept
2. Background information about a topic
3. Author profiles or project pages
4. Anything not available on arXiv

Note: For academic papers, prefer the "arxiv" tool.
Wikipedia works best for concepts, definitions, people, and places. For recent news or niche queries, results may be sparse.`,
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Operation: "search"',
        enum: ['search'],
      },
      query: {
        type: 'string',
        description: 'Search query',
      },
      maxResults: {
        type: 'number',
        description: 'Max results (default 5)',
        default: 5,
      },
    },
    required: ['action', 'query'],
  },

  async execute(input: Record<string, any>): Promise<any> {
    const start = Date.now()
    try {
      if (input.action !== 'search') {
        return {
          success: false,
          error: `Unknown action: ${input.action}`,
          durationMs: Date.now() - start,
          toolName: 'web_search',
        }
      }

      const query = String(input.query || '').trim()
      if (!query) {
        return {
          success: false,
          error: 'query is required',
          durationMs: Date.now() - start,
          toolName: 'web_search',
        }
      }

      const maxResults = Math.min(10, input.maxResults || 5)

      // 主搜索源：Wikipedia OpenSearch + Summary API（稳定、无反爬虫）
      let results = await searchViaWikipedia(query, maxResults)

      // 兜底 1：Wikipedia 全文搜索（解决 OpenSearch 只做标题前缀匹配的问题）
      if (results.length === 0) {
        results = await searchViaWikipediaFullText(query, maxResults)
      }

      // 兜底 2：拆成单个关键词分别搜 Wikipedia OpenSearch，合并去重
      if (results.length === 0) {
        results = await searchViaIndividualKeywords(query, maxResults)
      }

      // 兜底 3：Wikipedia 仍没结果 + query 是长句（>4 词），提炼关键词 join 重试
      if (results.length === 0) {
        const wordCount = query.split(/\s+/).filter(Boolean).length
        if (wordCount > 4) {
          // 取前 3 个非停用词作为关键词
          const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'what', 'who', 'when', 'where', 'why', 'how', 'explain', 'describe', 'tell', 'me', 'about', 'in', 'on', 'of', 'for', 'and', 'or', 'to', 'with', 'i', 'you', 'he', 'she', 'it', 'we', 'they'])
          const keywords = query
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, ' ')
            .split(/\s+/)
            .filter((w) => w && !stopWords.has(w))
            .slice(0, 3)
          if (keywords.length > 0) {
            const refinedQuery = keywords.join(' ')
            results = await searchViaWikipedia(refinedQuery, maxResults)
          }
        }
      }

      // 兜底 4：Wikipedia 仍没结果，尝试 DuckDuckGo HTML（可能被反爬虫挡，返回空）
      if (results.length === 0) {
        results = await searchViaDuckDuckGo(query, maxResults)
      }

      return {
        success: true,
        output: { results, count: results.length, query },
        content: [{
          type: 'json',
          json: { results, count: results.length, query },
        }],
        durationMs: Date.now() - start,
        toolName: 'web_search',
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Web search tool failed',
        durationMs: Date.now() - start,
        toolName: 'web_search',
      }
    }
  },
}

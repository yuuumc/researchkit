/**
 * Arxiv Tool — 搜索 arXiv 论文
 *
 * MCP-style：标准化 input_schema + execute
 * - search: 按关键词搜索
 * - fetch: 按 arxiv id 抓取单篇论文
 */

import { Tool } from './types'

interface ArxivEntry {
  title: string
  authors: string[]
  summary: string
  arxivId: string
  url: string
  published: string
  categories: string[]
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function parseArxivXml(xml: string): ArxivEntry[] {
  const entries: ArxivEntry[] = []
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g
  let match
  while ((match = entryRegex.exec(xml)) !== null) {
    const entryXml = match[1]

    const titleMatch = entryXml.match(/<title>([\s\S]*?)<\/title>/)
    const summaryMatch = entryXml.match(/<summary>([\s\S]*?)<\/summary>/)
    const idMatch = entryXml.match(/<id>([\s\S]*?)<\/id>/)
    const publishedMatch = entryXml.match(/<published>([\s\S]*?)<\/published>/)

    // 作者列表
    const authorRegex = /<author>[\s\S]*?<name>([^<]+)<\/name>[\s\S]*?<\/author>/g
    const authors: string[] = []
    let authorMatch
    while ((authorMatch = authorRegex.exec(entryXml)) !== null) {
      authors.push(decodeXml(authorMatch[1]))
    }

    // 分类
    const categoryRegex = /<category[^>]+term="([^"]+)"/g
    const categories: string[] = []
    let catMatch
    while ((catMatch = categoryRegex.exec(entryXml)) !== null) {
      categories.push(catMatch[1])
    }

    const rawId = idMatch ? decodeXml(idMatch[1]) : ''
    const arxivId = rawId.split('/abs/')[1] || rawId

    if (titleMatch) {
      entries.push({
        title: decodeXml(titleMatch[1]).replace(/\s+/g, ' '),
        authors,
        summary: summaryMatch ? decodeXml(summaryMatch[1]).replace(/\s+/g, ' ') : '',
        arxivId,
        url: `https://arxiv.org/abs/${arxivId}`,
        published: publishedMatch ? decodeXml(publishedMatch[1]) : '',
        categories,
      })
    }
  }
  return entries
}

export const arxivTool: Tool = {
  name: 'arxiv',
  description: `Search arXiv for academic papers.

Actions:
- "search": Search papers by keywords (returns title, authors, abstract, arxiv id, url, categories)
- "fetch": Fetch a single paper by arxiv id (e.g., "2301.00001")

Use this tool when the user is reading a paper and you need to find related work, citations, or follow-up papers.`,
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Operation: "search" or "fetch"',
        enum: ['search', 'fetch'],
      },
      query: {
        type: 'string',
        description: 'Search query (for "search" action)',
      },
      arxivId: {
        type: 'string',
        description: 'arXiv id like "2301.00001" (for "fetch" action)',
      },
      maxResults: {
        type: 'number',
        description: 'Max results (default 5)',
        default: 5,
      },
    },
    required: ['action'],
  },

  async execute(input: Record<string, any>): Promise<any> {
    const start = Date.now()
    try {
      const maxResults = Math.min(10, input.maxResults || 5)

      let apiUrl: string
      if (input.action === 'fetch') {
        if (!input.arxivId) {
          return {
            success: false,
            error: 'arxivId is required for fetch action',
            durationMs: Date.now() - start,
            toolName: 'arxiv',
          }
        }
        apiUrl = `http://export.arxiv.org/api/query?id_list=${encodeURIComponent(input.arxivId)}&max_results=1`
      } else {
        // search
        const query = input.query || ''
        if (!query) {
          return {
            success: false,
            error: 'query is required for search action',
            durationMs: Date.now() - start,
            toolName: 'arxiv',
          }
        }
        apiUrl = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&max_results=${maxResults}&sortBy=relevance`
      }

      const response = await fetch(apiUrl, {
        headers: { 'User-Agent': 'ResearchKit/1.0 (https://researchkit.app)' },
      })

      if (!response.ok) {
        return {
          success: false,
          error: `arXiv API returned HTTP ${response.status}`,
          durationMs: Date.now() - start,
          toolName: 'arxiv',
        }
      }

      const xml = await response.text()
      const entries = parseArxivXml(xml)

      return {
        success: true,
        output: { entries, count: entries.length },
        content: [{
          type: 'json',
          json: { entries, count: entries.length },
        }],
        durationMs: Date.now() - start,
        toolName: 'arxiv',
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'arXiv tool failed',
        durationMs: Date.now() - start,
        toolName: 'arxiv',
      }
    }
  },
}

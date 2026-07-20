/**
 * Web Search Tool — DuckDuckGo HTML 搜索
 *
 * MCP-style：标准化 input_schema + execute
 * 不需要 API key，直接抓 DuckDuckGo HTML 接口
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

export const webSearchTool: Tool = {
  name: 'web_search',
  description: `Search the web via DuckDuckGo (no API key required).

Actions:
- "search": Web search (returns top results with title, url, snippet)

Use this tool when you need to find:
1. Recent news or blog posts about a topic
2. Official documentation links
3. Author profiles or project pages
4. Anything not available on arXiv

Note: For academic papers, prefer the "arxiv" tool.`,
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

      // DuckDuckGo HTML 接口（无需 API key）
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      })

      if (!response.ok) {
        return {
          success: false,
          error: `Search failed: HTTP ${response.status}`,
          durationMs: Date.now() - start,
          toolName: 'web_search',
        }
      }

      const html = await response.text()
      const results: SearchResult[] = []

      // DuckDuckGo HTML 结构：<a class="result__a" href="...">title</a>
      // <a class="result__snippet" href="...">snippet</a>
      const resultRegex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g

      let match
      while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
        let rawUrl = match[1]
        // DuckDuckGo 链接是 redirect：//duckduckgo.com/l/?uddg=<encoded>
        const uddgMatch = rawUrl.match(/uddg=([^&]+)/)
        if (uddgMatch) {
          rawUrl = decodeURIComponent(uddgMatch[1])
        }
        results.push({
          title: stripHtml(match[2]),
          url: rawUrl,
          snippet: stripHtml(match[3]),
        })
      }

      // 兜底：如果 regex 没匹配上，尝试更宽松的解析
      if (results.length === 0) {
        const titleRegex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
        while ((match = titleRegex.exec(html)) !== null && results.length < maxResults) {
          let rawUrl = match[1]
          const uddgMatch = rawUrl.match(/uddg=([^&]+)/)
          if (uddgMatch) rawUrl = decodeURIComponent(uddgMatch[1])
          results.push({
            title: stripHtml(match[2]),
            url: rawUrl,
            snippet: '',
          })
        }
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

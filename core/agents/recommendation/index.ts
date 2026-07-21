/**
 * Recommendation Agent — 推荐相关阅读
 *
 * 升级版（从"搜索"升级为"研究"）：
 * 不再是 Extract keywords → search
 * 而是 Research intent 分类：
 *   - improve:  改进 / 后续 该工作的论文
 *   - challenge: 反驳 / 质疑 / 替代 该工作的论文
 *   - apply:    应用 该工作的论文
 *   - survey:   综述 / 背景 该领域的论文
 *
 * 实现：
 * 1. LLM 生成 4 类 intent 各自的搜索关键词（共 3-5 个 intent）
 * 2. 循环使用每个关键词调 arXiv + Semantic Scholar（不再只用 keywords[0]）
 * 3. LLM 综合每篇的推荐理由（标注 intent 类型）
 */

import { AgentMessage, createMessage, AgentCapability } from '@/lib/mcp'
import { detectLocale, Locale, buildLanguageDirective } from '@/lib/locale'
import { buildRecommendationIntentPrompt, buildRecommendationReasonPrompt } from '@/prompts/recommendation'
import { getServerProvider } from '@/lib/server-provider'
import type { AgentInterface, AgentContext, AgentResult } from '@/types'

export type RecommendationIntent = 'improve' | 'challenge' | 'apply' | 'survey'

export interface RecommendedResource {
  title: string
  url: string
  reason: string         // 推荐理由（中文一句话）
  type: 'paper' | 'doc' | 'tutorial' | 'video' | 'book'
  relevance: number      // 0-1
  intent: RecommendationIntent  // 升级版新增：推荐类别
}

export interface RecommendationOutput {
  recommendations: RecommendedResource[]
  searchKeywords: string[]
  searchIntents: Array<{ intent: RecommendationIntent; keywords: string[] }>  // 升级版新增
}

/**
 * Semantic Scholar API — 用 citation count 检索
 */
async function searchSemanticScholar(query: string, limit = 3): Promise<RecommendedResource[]> {
  try {
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=title,url,abstract,year,citationCount`
    const response = await fetch(url, {
      headers: { 'User-Agent': 'ResearchKit/1.0' },
    })

    if (!response.ok) return []

    const data = await response.json()
    if (!data.data) return []

    return data.data.slice(0, limit).map((paper: any): RecommendedResource => ({
      title: paper.title || 'Untitled',
      url: paper.url || `https://www.semanticscholar.org/paper/${paper.paperId}`,
      reason: `Cited ${paper.citationCount || 0} times (${paper.year || 'N/A'})`,
      type: 'paper' as const,
      relevance: Math.min(1, (paper.citationCount || 0) / 1000),
      intent: 'survey',
    }))
  } catch {
    return []
  }
}

/**
 * arXiv API
 */
async function searchArxiv(query: string, limit = 3): Promise<RecommendedResource[]> {
  try {
    const url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&max_results=${limit}`
    const response = await fetch(url)
    if (!response.ok) return []

    const xml = await response.text()
    const entries: RecommendedResource[] = []

    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g
    let match
    while ((match = entryRegex.exec(xml)) !== null && entries.length < limit) {
      const entry = match[1]
      const titleMatch = entry.match(/<title>([^<]+)<\/title>/)
      const linkMatch = entry.match(/<id>([^<]+)<\/id>/)
      const summaryMatch = entry.match(/<summary>([^<]+)<\/summary>/)

      if (titleMatch && linkMatch) {
        entries.push({
          title: titleMatch[1].trim(),
          url: linkMatch[1].trim(),
          reason: summaryMatch ? summaryMatch[1].trim().substring(0, 100) + '...' : 'arXiv paper',
          type: 'paper',
          relevance: 0.7,
          intent: 'survey',
        })
      }
    }
    return entries
  } catch {
    return []
  }
}

/**
 * Recommendation Agent — class 化（v2.0）
 */
export class RecommendationAgent implements AgentInterface {
  name = 'Recommendation' as const
  description = '按 4 类研究意图（improve/challenge/apply/survey）推荐相关阅读'
  capabilities: AgentCapability[] = [
    {
      name: 'recommend',
      description: '生成 4 类 intent 关键词，循环搜索 arXiv/SemanticScholar，LLM 标注 intent + 中文推荐理由',
      inputs: ['content', 'knowledgeCard'],
      outputs: ['recommendations', 'searchIntents'],
    },
  ]

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const start = Date.now()
    try {
      const payload = {
        content: ctx.document.content,
        source_locale: ctx.options.sourceLocale,
        target_locale: ctx.options.locale,
        language_directive: ctx.options.languageDirective,
        knowledgeCard: ctx.previous.knowledgeCard,
      }
      const data = await this._run(payload)
      return { success: true, data, durationMs: Date.now() - start }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Recommendation failed'
      return { success: false, data: { error: msg }, durationMs: Date.now() - start, error: msg }
    }
  }

  async handleMessage(message: AgentMessage): Promise<AgentMessage> {
    if (message.type !== 'task') {
      return createMessage('error', 'Recommendation', message.from, { error: '只处理 task 类型消息' })
    }
    try {
      const output = await this._run(message.payload)
      return createMessage('result', 'Recommendation', message.from, output, message.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Recommendation failed'
      return createMessage('error', 'Recommendation', message.from, { error: msg }, message.id)
    }
  }

  private async _run(payload: any): Promise<RecommendationOutput> {
    const { content, knowledgeCard, language_directive } = payload

    const sourceLocale: Locale = payload.source_locale || detectLocale(content)
    const targetLocale: Locale = payload.target_locale || sourceLocale
    const finalLanguageDirective = language_directive || buildLanguageDirective(sourceLocale, targetLocale)

    // ===== Step 1: 让 LLM 生成 4 类 intent 关键词 =====
    const provider = getServerProvider()
    const intentResponse = await provider.chat(
      [
        {
          role: 'system',
          content: buildRecommendationIntentPrompt({ finalLanguageDirective }),
        },
        {
          role: 'user',
          content: `Paper title: ${knowledgeCard?.title || '(unknown)'}
Field: ${knowledgeCard?.field || 'unknown'}
Methodology: ${knowledgeCard?.methodology || 'unknown'}
Innovation: ${(knowledgeCard?.innovation || []).join('; ') || 'N/A'}
Datasets: ${(knowledgeCard?.datasets || []).join(', ') || 'N/A'}

Abstract (first 2000 chars):
${content.substring(0, 2000)}`,
        },
      ],
      {
        responseFormat: 'json_object',
        temperature: 0.4,
      }
    )

    const intentRaw = intentResponse.content || '{}'
    let intentParsed: any
    try {
      intentParsed = JSON.parse(intentRaw)
    } catch (err) {
      console.error('[Recommendation] intent LLM 返回非 JSON:', intentRaw.substring(0, 500))
      intentParsed = { applicable: false, search_intents: [] }
    }

    const isApplicable: boolean = intentParsed.applicable !== false
    const searchIntents: Array<{ intent: RecommendationIntent; keywords: string[] }> = (intentParsed.search_intents || [])
      .filter((s: any) => s && s.intent && Array.isArray(s.keywords))
      .map((s: any) => ({
        intent: s.intent as RecommendationIntent,
        keywords: s.keywords.filter((k: any) => typeof k === 'string' && k.trim()).slice(0, 3),
      }))

    if (!isApplicable || searchIntents.length === 0) {
      return {
        recommendations: [],
        searchKeywords: [],
        searchIntents: [],
      }
    }

    // ===== Step 2: 循环每个 intent 的每个关键词，并行搜索 arXiv + SemanticScholar =====
    const allSearchPromises: Promise<RecommendedResource[]>[] = []
    for (const si of searchIntents) {
      for (const kw of si.keywords) {
        if (!kw) continue
        const withIntent = async (intent: RecommendationIntent, keyword: string): Promise<RecommendedResource[]> => {
          const [ss, ax] = await Promise.all([
            searchSemanticScholar(keyword, 2),
            searchArxiv(keyword, 2),
          ])
          return [...ss, ...ax].map(r => ({ ...r, intent }))
        }
        allSearchPromises.push(withIntent(si.intent, kw))
      }
    }

    const searchResults = await Promise.all(allSearchPromises)
    const allResults: RecommendedResource[] = searchResults.flat()

    const seen = new Set<string>()
    const deduped = allResults.filter(r => {
      const key = r.url.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, 12)

    // ===== Step 3: LLM 综合每篇的推荐理由 =====
    let finalRecommendations = deduped
    if (deduped.length > 0) {
      const reasonResponse = await provider.chat(
        [
          {
            role: 'system',
            content: buildRecommendationReasonPrompt({ finalLanguageDirective }),
          },
          {
            role: 'user',
            content: `Original paper:
  Title: ${knowledgeCard?.title || '(unknown)'}
  Field: ${knowledgeCard?.field || 'unknown'}
  Innovation: ${(knowledgeCard?.innovation || []).join('; ') || 'N/A'}

Candidate papers (JSON):
${JSON.stringify(deduped, null, 2)}`,
          },
        ],
        {
          responseFormat: 'json_object',
          temperature: 0.3,
        }
      )

      const reasonRaw = reasonResponse.content || '{}'
      try {
        const reasonParsed = JSON.parse(reasonRaw)
        if (Array.isArray(reasonParsed.recommendations)) {
          finalRecommendations = reasonParsed.recommendations
            .filter((r: any) => r && r.url && r.title)
            .map((r: any) => ({
              title: String(r.title),
              url: String(r.url),
              reason: String(r.reason || ''),
              type: 'paper' as const,
              relevance: Math.min(1, Math.max(0, Number(r.relevance) || 0.5)),
              intent: (['improve', 'challenge', 'apply', 'survey'].includes(r.intent) ? r.intent : 'survey') as RecommendationIntent,
            }))
        }
      } catch {
        // 用原始结果
      }
    }

    const allKeywords = Array.from(new Set(searchIntents.flatMap(si => si.keywords)))

    const output: RecommendationOutput = {
      recommendations: finalRecommendations,
      searchKeywords: allKeywords,
      searchIntents,
    }

    return output
  }

  getCapabilities(): AgentCapability[] {
    return this.capabilities
  }
}

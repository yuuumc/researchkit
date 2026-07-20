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

import OpenAI from 'openai'
import { Agent, AgentMessage, createMessage } from '../mcp'
import { detectLocale, Locale, buildLanguageDirective } from '../locale'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: (process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1').trim(),
})

const LLM_MODEL = process.env.LLM_MODEL?.trim() || 'deepseek-v4-flash'

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
      intent: 'survey',  // 默认；后续 LLM 会重分类
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
          intent: 'survey',  // 默认；后续 LLM 会重分类
        })
      }
    }
    return entries
  } catch {
    return []
  }
}

export const RecommendationAgent: Agent = {
  name: 'Recommendation',
  description: '按 4 类研究意图（improve/challenge/apply/survey）推荐相关阅读',
  capabilities: [
    {
      name: 'recommend',
      description: '生成 4 类 intent 关键词，循环搜索 arXiv/SemanticScholar，LLM 标注 intent + 中文推荐理由',
      inputs: ['content', 'knowledgeCard'],
      outputs: ['recommendations', 'searchIntents'],
    },
  ],

  async handleMessage(message: AgentMessage): Promise<AgentMessage> {
    if (message.type !== 'task') {
      return createMessage('error', 'Recommendation', message.from, { error: '只处理 task 类型消息' })
    }

    const { content, knowledgeCard, language_directive } = message.payload

    // Locale 检测（升级版：从 coordinator 传入或本地检测）
    const sourceLocale: Locale = message.payload.source_locale || detectLocale(content)
    const targetLocale: Locale = message.payload.target_locale || sourceLocale
    const finalLanguageDirective = language_directive || buildLanguageDirective(sourceLocale, targetLocale)

    // ===== Step 1: 让 LLM 生成 4 类 intent 关键词（不再只生成一个 keywords 数组） =====
    const intentResponse = await openai.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are the Recommendation Agent in a research pipeline.

Don't just "find similar papers". Act as a research librarian who knows the 4 distinct ways a reader wants to follow up on a paper.

${finalLanguageDirective}

IMPORTANT — Search keywords MUST always be in English (search engines work best with English keywords), even if the input is in another language. But the natural-language fields (rationale, reason, etc.) MUST follow the language directive above.

## Intents
1. improve   — Papers that BUILD ON or EXTEND this work (follow-up, improvements, scaling, efficiency gains)
2. challenge — Papers that CRITIQUE, REFUTE, or propose ALTERNATIVES to this work (counter-evidence, competing methods)
3. apply     — Papers that APPLY this work's methods to new domains or real-world problems
4. survey    — Survey / background / foundational papers a reader should read FIRST to understand this work's context

Generate 1-3 search keywords for EACH intent (some intents may have 0 keywords if not applicable).

## Rules
- Keywords should be SEARCH-READY (English, ≤ 4 words, no special chars) — always English for search compatibility.
- Use the paper's title / methodology / field / datasets as inspiration.
- Don't generate generic keywords like "machine learning" — be specific.
- If the input is NOT a research paper (e.g., a blog post, documentation), set ALL intents to empty arrays and set applicable=false.

## Output Contract
Respond ONLY in JSON:
{
  "applicable": true | false,
  "search_intents": [
    {"intent": "improve", "keywords": ["...", "..."]},
    {"intent": "challenge", "keywords": ["...", "..."]},
    {"intent": "apply", "keywords": ["...", "..."]},
    {"intent": "survey", "keywords": ["...", "..."]}
  ]
}`,
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
      response_format: { type: 'json_object' },
      temperature: 0.4,
    })

    const intentRaw = intentResponse.choices[0]?.message?.content || '{}'
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

    // 不适用（非论文）— 直接返回空
    if (!isApplicable || searchIntents.length === 0) {
      return createMessage('result', 'Recommendation', message.from, {
        recommendations: [],
        searchKeywords: [],
        searchIntents: [],
      } as RecommendationOutput, message.id)
    }

    // ===== Step 2: 循环每个 intent 的每个关键词，并行搜索 arXiv + SemanticScholar =====
    const allSearchPromises: Promise<RecommendedResource[]>[] = []
    for (const si of searchIntents) {
      for (const kw of si.keywords) {
        if (!kw) continue
        // 标注 intent 到搜索结果上
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

    // 去重（按 url）
    const seen = new Set<string>()
    const deduped = allResults.filter(r => {
      const key = r.url.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, 12)  // 上限 12 篇，给 LLM 综合时留选择空间

    // ===== Step 3: LLM 综合每篇的推荐理由（标注 intent + 用目标语言写 reason） =====
    let finalRecommendations = deduped
    if (deduped.length > 0) {
      const reasonResponse = await openai.chat.completions.create({
        model: LLM_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are a research librarian reviewing a list of recommended papers for a researcher.

${finalLanguageDirective}

## Task
For each candidate paper below, decide:
1. Whether to KEEP or DROP it (drop if obviously irrelevant or duplicate topic)
2. Write a personalized reason (one sentence) in the target language, explaining why this paper is relevant to the ORIGINAL paper.
3. Assign the correct intent category (improve / challenge / apply / survey) based on the paper's content.
4. Assign a relevance score 0-1 (1 = highly relevant, 0.3 = tangentially related).

## Reason Quality Bars (CRITICAL — distinguishes good from generic)

GOOD reason: "Extends self-attention to linear complexity via random features, directly addressing Transformer's O(n²) bottleneck"
BAD:  "Related to attention mechanisms"
- GOOD ties the candidate's contribution to a SPECIFIC aspect of the original paper.
- BAD is a vague category-level claim that fits many papers.

GOOD reason: "Proposes alternative recurrence-based architecture that matches Transformer quality without attention — direct counter-evidence"
BAD:  "Different approach to the problem"
- GOOD explains WHY this paper challenges / improves / applies / surveys the original.
- BAD only says it's different.

GOOD reason: "Foundational survey of attention mechanisms pre-Transformer — gives essential context for understanding the original's contribution"
BAD:  "Good background reading"
- GOOD explains what specific context the candidate provides.
- BAD is generic praise.

## Rules
- Keep at most 6 papers total, prioritizing diversity of intents (don't return all "survey").
- Don't make up information not present in the candidate paper's metadata.
- If you drop a paper, don't include it in output.
- The reason MUST mention the original paper's contribution or methodology (not just describe the candidate).

## Output Contract
Respond ONLY in JSON:
{"recommendations":[
  {"title":"...","url":"...","reason":"one-sentence reason in the target language","type":"paper","relevance":0.85,"intent":"improve"}
]}`,
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
        response_format: { type: 'json_object' },
        temperature: 0.3,
      })

      const reasonRaw = reasonResponse.choices[0]?.message?.content || '{}'
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

    // 收集所有关键词（向后兼容 searchKeywords 字段）
    const allKeywords = Array.from(new Set(searchIntents.flatMap(si => si.keywords)))

    const output: RecommendationOutput = {
      recommendations: finalRecommendations,
      searchKeywords: allKeywords,
      searchIntents,
    }

    return createMessage('result', 'Recommendation', message.from, output, message.id)
  },

  getCapabilities() {
    return this.capabilities
  },
}

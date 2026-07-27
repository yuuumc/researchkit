/**
 * Citation Check 业务逻辑封装
 *
 * 流程（仿 compare-papers 单次 LLM JSON 打分）：
 *  1. 从 claim 提取 1-5 个关键词（规则法，避免 LLM 二次调用）
 *  2. 调 arxiv 工具检索 top-K 摘要
 *  3. 单次 LLM 调用，返回 STRICT JSON：verified / confidence / supporting_papers / explanation
 *
 * 失败时抛错（不静默降级），由 gate.ts 转换为 502。
 */

import { getServerProvider } from './server-provider'
import { setCurrentAgent } from './usage-collector'
import { callTool } from './tools/registry'

export interface CitationCheckResult {
  verified: boolean
  confidence: number                 // 0-1
  supporting_papers: Array<{
    title: string
    arxiv_id: string
    url: string
    relevance: 'supporting' | 'contradicting' | 'neutral'
    reason: string
  }>
  explanation: string
  model?: string
  durationMs?: number
}

export interface CitationCheckOptions {
  maxPapers?: number
  arxivTimeoutMs?: number
  temperature?: number
  llmTimeoutMs?: number
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'can', 'of', 'in', 'on', 'at', 'to',
  'for', 'with', 'by', 'from', 'as', 'and', 'or', 'but', 'not', 'this',
  'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'we',
  'us', 'our', 'you', 'your', 'he', 'she', 'his', 'her', 'i',
  // 学术常见动词/虚词
  'show', 'showed', 'shown', 'shows', 'paper', 'study', 'studies', 'research',
  'result', 'results', 'method', 'methods', 'approach', 'based',
])

/**
 * 规则法提取关键词：去标点 → 分词 → 去停用词 → 取前 5 个
 */
function extractKeywords(claim: string): string[] {
  const words = claim
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w))
  // 去重保序
  const seen = new Set<string>()
  const out: string[] = []
  for (const w of words) {
    if (seen.has(w)) continue
    seen.add(w)
    out.push(w)
    if (out.length >= 5) break
  }
  return out
}

interface ArxivEntry {
  title: string
  authors: string[]
  summary: string
  arxivId: string
  url: string
  published: string
  categories: string[]
}

async function searchArxiv(query: string, maxResults: number, timeoutMs: number): Promise<ArxivEntry[]> {
  const toolCallPromise = callTool('arxiv', {
    action: 'search',
    query,
    maxResults,
  })
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`arxiv search exceeded ${timeoutMs}ms`)), timeoutMs)
  })

  const toolCall = await Promise.race([toolCallPromise, timeoutPromise])
  const result = toolCall?.result
  if (!result || result.success === false) {
    throw new Error(`arxiv tool failed: ${result?.error || 'unknown'}`)
  }
  return Array.isArray(result.output?.entries) ? result.output.entries : []
}

function buildPrompt(claim: string, papers: ArxivEntry[]): Array<{ role: 'system' | 'user'; content: string }> {
  const papersBlock = papers.map((p, i) => (
    `### Paper ${i + 1}
Title: ${p.title}
arXiv ID: ${p.arxivId}
URL: ${p.url}
Abstract: ${p.summary}`
  )).join('\n\n')

  const system = `You are a citation verification analyst. Given a research claim and a list of candidate papers (with abstracts), determine whether the claim is supported by the literature.

Return STRICT JSON only (no markdown, no comments):
{
  "verified": true | false,
  "confidence": 0.0-1.0,
  "supporting_papers": [
    {
      "arxiv_id": "...",
      "title": "...",
      "url": "...",
      "relevance": "supporting" | "contradicting" | "neutral",
      "reason": "one sentence why this paper supports/contradicts/is neutral to the claim"
    }
  ],
  "explanation": "2-3 sentence overall assessment of whether the claim is well-supported"
}

Rules:
- "verified" = true ONLY if at least one paper clearly supports the claim
- "confidence" reflects how strong and consistent the evidence is
- Only include papers in supporting_papers if they are clearly relevant (supporting or contradicting)
- If no relevant papers found, return verified=false, confidence=0, supporting_papers=[], explanation="No relevant papers found"`

  const user = `Claim to verify:
"${claim}"

Candidate papers from arXiv:

${papersBlock || '(No papers retrieved from arXiv)'}

Return the JSON verification result as specified.`

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

function normalizeResult(parsed: any, papers: ArxivEntry[]): CitationCheckResult {
  const verified = parsed?.verified === true
  const confidenceRaw = Number(parsed?.confidence)
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(1, confidenceRaw))
    : 0

  const supportingPapers: CitationCheckResult['supporting_papers'] = []
  if (Array.isArray(parsed?.supporting_papers)) {
    for (const p of parsed.supporting_papers) {
      if (!p || typeof p !== 'object') continue
      const arxivId = String(p.arxiv_id || '')
      const matched = papers.find(e => e.arxivId === arxivId)
      if (!matched) continue   // 仅保留真实检索到的论文，防 LLM 编造
      const relevanceRaw = String(p.relevance || 'neutral').toLowerCase()
      const relevance = (['supporting', 'contradicting', 'neutral'].includes(relevanceRaw)
        ? relevanceRaw
        : 'neutral') as 'supporting' | 'contradicting' | 'neutral'
      supportingPapers.push({
        title: matched.title,
        arxiv_id: matched.arxivId,
        url: matched.url,
        relevance,
        reason: String(p.reason || '').substring(0, 300),
      })
    }
  }

  return {
    verified,
    confidence,
    supporting_papers: supportingPapers,
    explanation: String(parsed?.explanation || '').substring(0, 800),
  }
}

/**
 * 验证一条学术声明是否被 arXiv 文献支持。
 * 失败时抛错（不静默降级）。
 */
export async function checkCitation(
  claim: string,
  opts: CitationCheckOptions = {}
): Promise<CitationCheckResult> {
  const startTime = Date.now()

  if (typeof claim !== 'string' || claim.trim().length < 5) {
    throw new Error('claim must be a string of at least 5 characters')
  }

  const maxPapers = Math.min(Math.max(opts.maxPapers ?? 5, 1), 10)
  const arxivTimeoutMs = opts.arxivTimeoutMs ?? 20_000
  const llmTimeoutMs = opts.llmTimeoutMs ?? 45_000

  // 1. 提取关键词
  const keywords = extractKeywords(claim)
  if (keywords.length === 0) {
    throw new Error('Failed to extract keywords from claim')
  }
  const query = keywords.join(' ')

  // 2. arxiv 检索（带超时）
  let papers: ArxivEntry[] = []
  try {
    papers = await searchArxiv(query, maxPapers, arxivTimeoutMs)
  } catch (e) {
    throw new Error(`arxiv search failed: ${e instanceof Error ? e.message : String(e)}`)
  }

  // 3. 单次 LLM 调用，JSON 打分
  setCurrentAgent('Compare')  // 复用 Compare agent 的 usage 归属
  const provider = getServerProvider()
  const messages = buildPrompt(claim, papers)

  const response = await provider.chat(messages, {
    responseFormat: 'json_object',
    temperature: opts.temperature ?? 0.2,
    timeout: llmTimeoutMs,
  })

  if (!response.content) {
    throw new Error('LLM returned empty content')
  }

  let parsed: any
  try {
    parsed = JSON.parse(response.content)
  } catch (e) {
    throw new Error(`LLM JSON parse failed: ${response.content.substring(0, 300)}`)
  }

  const result = normalizeResult(parsed, papers)
  result.model = response.model
  result.durationMs = Date.now() - startTime
  return result
}

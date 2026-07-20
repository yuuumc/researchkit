/**
 * Knowledge Builder Agent — 汇总各 Agent 结果，构建最终知识卡
 *
 * 升级要点：
 * - 接收 Reader 新字段（takeaway / whyItMatters / whatSurprised / whoShouldRead / readingDifficulty）
 * - 接收 Terminology 新字段（importance / prerequisite）
 * - 加 evaluation 评分：Completeness / Confidence / Evidence
 *   - Completeness: 基于核心字段填充率计算（0-100%）
 *   - Confidence: 基于字段质量（有数字证据 +1，泛泛而谈 -1）（0-100%）
 *   - Evidence: Strong / Medium / Weak（基于 results/quantitative 数据数量）
 */

import { AgentMessage, createMessage, AgentCapability } from '@/lib/mcp'
import type { ReaderOutput } from '@/lib/agents/reader'
import type { AnalyzerOutput } from '@/lib/agents/analyzer'
import type { TerminologyOutput } from '@/lib/agents/terminology'
import type { Locale } from '@/lib/locale'
import type { AgentInterface, AgentContext, AgentResult } from '@/types'

/**
 * 知识卡评分 — 给用户质量信号
 */
export interface KnowledgeCardEvaluation {
  completeness: number          // 0-100, 核心字段填充率
  confidence: number            // 0-100, 字段质量分
  evidence: 'Strong' | 'Medium' | 'Weak'  // 证据强度
  filled_fields: string[]      // 已填字段
  missing_fields: string[]     // 应有但缺失的字段
}

export interface KnowledgeCard {
  // 基础
  title: string
  authors: string[]
  field: string
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced'
  year?: number

  // 升级版新增：检测到的输入语言
  language?: 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es' | 'other'
  locale?: Locale                          // 升级版：完整 locale（zh-CN / en-US / ja-JP 等）

  // 核心（来自 Analyzer）
  summary: string                 // 一句话摘要
  research_goals: string[]
  innovation: string[]
  methodology: string
  experiments: string[]
  results: string[]
  limitations: string[]
  future_work: string[]

  // Reader 新增（价值导向）
  takeaway?: string               // 一句话核心结论
  why_it_matters?: string         // 为什么这篇论文重要
  what_surprised?: string         // 最令人意外的发现
  who_should_read?: string[]      // 谁应该读这篇论文

  // 术语（来自 Terminology，含 importance + prerequisite）
  key_terms: Array<{
    term: string
    definition: string
    category?: 'concept' | 'method' | 'tool' | 'metric'
    importance?: 1 | 2 | 3 | 4 | 5
    prerequisite?: string[]
  }>

  // 应用 & 关联
  applications: string[]
  datasets: string[]
  citations: string[]
  references: string[]

  // 元数据
  reading_time_min?: number
  structure?: string
  tags: string[]

  // 升级版新增：评分
  evaluation?: KnowledgeCardEvaluation
}

/**
 * Knowledge Builder Agent — class 化（v2.0）
 */
export class KnowledgeBuilderAgent implements AgentInterface {
  name = 'KnowledgeBuilder' as const
  description = '汇总各 Agent 结果，构建完整知识卡 + 质量评分'
  capabilities: AgentCapability[] = [
    {
      name: 'build',
      description: '汇总多 Agent 结果，构建知识卡 + 评估 Completeness/Confidence/Evidence',
      inputs: ['readerOutput', 'analyzerOutput', 'terminologyOutput'],
      outputs: ['knowledgeCard', 'evaluation'],
    },
  ]

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const start = Date.now()
    try {
      const payload = {
        title: ctx.document.title,
        readerOutput: ctx.previous.reader,
        analyzerOutput: ctx.previous.analyzer,
        terminologyOutput: ctx.previous.terminology,
      }
      const data = await this._run(payload)
      return { success: true, data, durationMs: Date.now() - start }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'KnowledgeBuilder failed'
      return { success: false, data: { error: msg }, durationMs: Date.now() - start, error: msg }
    }
  }

  async handleMessage(message: AgentMessage): Promise<AgentMessage> {
    if (message.type !== 'task') {
      return createMessage('error', 'KnowledgeBuilder', message.from, { error: '只处理 task 类型消息' })
    }
    try {
      const output = await this._run(message.payload)
      return createMessage('result', 'KnowledgeBuilder', message.from, output, message.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'KnowledgeBuilder failed'
      return createMessage('error', 'KnowledgeBuilder', message.from, { error: msg }, message.id)
    }
  }

  private async _run(payload: any): Promise<KnowledgeCard> {
    const {
      title,
      readerOutput,
      analyzerOutput,
      terminologyOutput,
    } = payload

    const reader = readerOutput as ReaderOutput
    const analyzer = analyzerOutput as AnalyzerOutput
    const terminology = terminologyOutput as TerminologyOutput

    const tags = ['researchkit']
    if (analyzer?.methodology) tags.push('methodology')
    if ((terminology?.terms || []).length > 0) tags.push('terms')
    if (reader?.structure || analyzer?.structure) tags.push('structured')

    const difficulty: 'Beginner' | 'Intermediate' | 'Advanced' =
      reader?.readingDifficulty ||
      ((analyzer?.limitations?.length || 0) > 3 ? 'Advanced' :
       (terminology?.terms || []).length > 7 ? 'Advanced' : 'Intermediate')

    const fallbackSummary: string = reader?.takeaway || reader?.summary
      || (analyzer?.innovation && analyzer.innovation.length > 0 ? analyzer.innovation[0] : '')
      || analyzer?.methodology
      || ''
    const generateTitle = (): string => {
      if (title && title.trim()) return title.trim()
      if (!fallbackSummary) return 'Untitled'
      const firstSentence = fallbackSummary.split(/[.。!！?？\n]/)[0] || fallbackSummary
      if (firstSentence.length > 80) {
        return firstSentence.substring(0, 77) + '...'
      }
      return firstSentence || 'Untitled'
    }

    const filled: string[] = []
    const missing: string[] = []

    const coreFields: Array<{ name: string; value: any; isFilled: boolean }> = [
      { name: 'title',           value: generateTitle(),                       isFilled: !!generateTitle() && generateTitle() !== 'Untitled' },
      { name: 'summary',         value: fallbackSummary,                       isFilled: !!fallbackSummary },
      { name: 'takeaway',        value: reader?.takeaway,                       isFilled: !!reader?.takeaway },
      { name: 'why_it_matters',  value: reader?.whyItMatters,                  isFilled: !!reader?.whyItMatters },
      { name: 'authors',         value: analyzer?.authors || reader?.authors,  isFilled: !!(analyzer?.authors?.length || reader?.authors?.length) },
      { name: 'field',           value: analyzer?.field,                       isFilled: !!analyzer?.field },
      { name: 'research_goals',  value: analyzer?.researchGoals,               isFilled: !!(analyzer?.researchGoals?.length) },
      { name: 'innovation',      value: analyzer?.innovation,                  isFilled: !!(analyzer?.innovation?.length) },
      { name: 'methodology',    value: analyzer?.methodology,                 isFilled: !!analyzer?.methodology },
      { name: 'experiments',     value: analyzer?.experiments,                isFilled: !!(analyzer?.experiments?.length) },
      { name: 'results',         value: analyzer?.results,                      isFilled: !!(analyzer?.results?.length) },
      { name: 'limitations',     value: analyzer?.limitations,                 isFilled: !!(analyzer?.limitations?.length) },
      { name: 'future_work',     value: analyzer?.futureWork,                  isFilled: !!(analyzer?.futureWork?.length) },
      { name: 'applications',    value: analyzer?.applications,                isFilled: !!(analyzer?.applications?.length) },
      { name: 'datasets',        value: analyzer?.datasets,                     isFilled: !!(analyzer?.datasets?.length) },
      { name: 'key_terms',       value: terminology?.terms,                     isFilled: !!(terminology?.terms?.length) },
    ]

    for (const f of coreFields) {
      if (f.isFilled) filled.push(f.name)
      else missing.push(f.name)
    }

    const completeness = Math.round((filled.length / coreFields.length) * 100)

    let confidenceScore = 50
    const hasNumbers = (analyzer?.results || []).some(r => /\d+(\.\d+)?%?/.test(r))
    if (hasNumbers) confidenceScore += 15
    const hasSpecificInnovation = (analyzer?.innovation || []).some(i => i.length > 20 && !/novel|new approach/i.test(i))
    if (hasSpecificInnovation) confidenceScore += 15
    if ((terminology?.terms || []).length >= 3) confidenceScore += 10
    if (reader?.takeaway) confidenceScore += 10
    if (!analyzer?.methodology) confidenceScore -= 5
    if (!(analyzer?.results?.length)) confidenceScore -= 5
    if (!(analyzer?.innovation?.length)) confidenceScore -= 10

    const confidence = Math.max(0, Math.min(100, confidenceScore))

    const quantitativeCount = (analyzer?.results || []).filter(r => /\d+(\.\d+)?/.test(r)).length
    const evidence: 'Strong' | 'Medium' | 'Weak' =
      quantitativeCount >= 3 ? 'Strong' :
      quantitativeCount >= 1 ? 'Medium' : 'Weak'

    const evaluation: KnowledgeCardEvaluation = {
      completeness,
      confidence,
      evidence,
      filled_fields: filled,
      missing_fields: missing,
    }

    const card: KnowledgeCard = {
      title: generateTitle(),
      authors: analyzer?.authors?.length ? analyzer.authors : (reader?.authors || []),
      field: analyzer?.field || '',
      difficulty,
      year: analyzer?.year,
      language: reader?.language || 'other',
      locale: reader?.locale,
      summary: fallbackSummary,
      research_goals: analyzer?.researchGoals || [],
      innovation: analyzer?.innovation || [],
      methodology: analyzer?.methodology || '',
      experiments: analyzer?.experiments || [],
      results: analyzer?.results || [],
      limitations: analyzer?.limitations || [],
      future_work: analyzer?.futureWork || [],
      takeaway: reader?.takeaway,
      why_it_matters: reader?.whyItMatters,
      what_surprised: reader?.whatSurprised,
      who_should_read: reader?.whoShouldRead,
      key_terms: (terminology?.terms || []).map(t => ({
        term: t.term,
        definition: t.definition,
        category: t.category as 'concept' | 'method' | 'tool' | 'metric' | undefined,
        importance: t.importance,
        prerequisite: t.prerequisite,
      })),
      applications: analyzer?.applications || [],
      datasets: analyzer?.datasets || [],
      citations: [],
      references: [],
      reading_time_min: reader?.readingTimeMin,
      structure: analyzer?.structure || reader?.structure,
      tags,
      evaluation,
    }

    return card
  }

  getCapabilities(): AgentCapability[] {
    return this.capabilities
  }
}

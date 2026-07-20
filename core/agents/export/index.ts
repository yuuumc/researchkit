/**
 * Export Agent — 负责把知识卡导出为多种格式
 * 输入：KnowledgeCard
 * 输出：Markdown / Obsidian / JSON / Mermaid Mindmap
 *
 * 升级版：加入 Mermaid mindmap 格式
 */

import { AgentMessage, createMessage, AgentCapability } from '@/lib/mcp'
import { exportToMarkdown, exportToObsidian, exportToMindmap } from '@/lib/parser'
import type { KnowledgeCard } from '@/lib/agents/knowledge-builder'
import type { RecommendationOutput } from '@/lib/agents/recommendation'
import type { AgentInterface, AgentContext, AgentResult } from '@/types'

export interface ExportOutput {
  markdown: string
  obsidian: string
  json: string
  mindmap: string                    // Mermaid mindmap 语法（升级版新增）
}

/**
 * Export Agent — class 化（v2.0）
 */
export class ExportAgent implements AgentInterface {
  name = 'Export' as const
  description = '把知识卡导出为 Markdown / Obsidian / JSON / Mermaid Mindmap 格式'
  capabilities: AgentCapability[] = [
    {
      name: 'export',
      description: '生成多种格式的导出',
      inputs: ['knowledgeCard'],
      outputs: ['markdown', 'obsidian', 'json', 'mindmap'],
    },
  ]

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const start = Date.now()
    try {
      const payload = {
        knowledgeCard: ctx.previous.knowledgeCard,
        recommendations: ctx.previous.recommendation || { recommendations: [], searchKeywords: [] },
        source: ctx.document.source,
      }
      const data = await this._run(payload)
      return { success: true, data, durationMs: Date.now() - start }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Export failed'
      return { success: false, data: { error: msg }, durationMs: Date.now() - start, error: msg }
    }
  }

  async handleMessage(message: AgentMessage): Promise<AgentMessage> {
    if (message.type !== 'task') {
      return createMessage('error', 'Export', message.from, { error: '只处理 task 类型消息' })
    }
    try {
      const output = await this._run(message.payload)
      return createMessage('result', 'Export', message.from, output, message.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Export failed'
      return createMessage('error', 'Export', message.from, { error: msg }, message.id)
    }
  }

  private async _run(payload: any): Promise<ExportOutput> {
    const { knowledgeCard, recommendations, source } = payload
    const recs = recommendations as RecommendationOutput | undefined

    // 防御：knowledgeCard 可能是 undefined（KB 失败时兜底逻辑没生效）
    const card = (knowledgeCard || {
      title: 'Untitled',
      authors: [],
      field: '',
      difficulty: 'Intermediate' as const,
      summary: '',
      research_goals: [],
      innovation: [],
      methodology: '',
      experiments: [],
      results: [],
      limitations: [],
      future_work: [],
      key_terms: [],
      applications: [],
      datasets: [],
      citations: [],
      references: [],
      tags: ['researchkit', 'fallback'],
    }) as KnowledgeCard

    const cardWithRecs: KnowledgeCard = {
      ...card,
      references: [
        ...((card.references as string[]) || []),
        ...(recs?.recommendations || []).map(r => `${r.title} — ${r.url}`),
      ],
    }

    const markdown = exportToMarkdown(cardWithRecs, source)
    const obsidian = exportToObsidian(cardWithRecs, source)
    const mindmap = exportToMindmap(cardWithRecs)
    const json = JSON.stringify({
      knowledge_card: cardWithRecs,
      recommendations: recs?.recommendations || [],
      metadata: {
        exported_at: new Date().toISOString(),
        agent_pipeline: ['Planner', 'Reader', 'Analyzer', 'Terminology', 'KnowledgeBuilder', 'Recommendation', 'Export'],
        exports: ['markdown', 'obsidian', 'json', 'mindmap'],
      },
    }, null, 2)

    const output: ExportOutput = { markdown, obsidian, json, mindmap }
    return output
  }

  getCapabilities(): AgentCapability[] {
    return this.capabilities
  }
}

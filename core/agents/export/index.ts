/**
 * Export Agent — 负责把知识卡导出为多种格式
 * 输入：KnowledgeCard
 * 输出：Markdown / Obsidian / JSON / Mermaid Mindmap
 *
 * 升级版：加入 Mermaid mindmap 格式
 */

import { Agent, AgentMessage, createMessage } from '@/lib/mcp'
import { exportToMarkdown, exportToObsidian, exportToMindmap } from '@/lib/parser'
import type { KnowledgeCard } from '@/lib/agents/knowledge-builder'
import type { RecommendationOutput } from '@/lib/agents/recommendation'

export interface ExportOutput {
  markdown: string
  obsidian: string
  json: string
  mindmap: string                    // Mermaid mindmap 语法（升级版新增）
}

export const ExportAgent: Agent = {
  name: 'Export',
  description: '把知识卡导出为 Markdown / Obsidian / JSON / Mermaid Mindmap 格式',
  capabilities: [
    {
      name: 'export',
      description: '生成多种格式的导出',
      inputs: ['knowledgeCard'],
      outputs: ['markdown', 'obsidian', 'json', 'mindmap'],
    },
  ],

  async handleMessage(message: AgentMessage): Promise<AgentMessage> {
    if (message.type !== 'task') {
      return createMessage('error', 'Export', message.from, { error: '只处理 task 类型消息' })
    }

    const { knowledgeCard, recommendations, source } = message.payload
    const recs = recommendations as RecommendationOutput | undefined

    // 防御：knowledgeCard 可能是 undefined（KB 失败时兜底逻辑没生效）
    // 用空对象兜底，至少能导出空卡而不是抛错
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

    // 在 references 字段中加入推荐阅读
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

    return createMessage('result', 'Export', message.from, output, message.id)
  },

  getCapabilities() {
    return this.capabilities
  },
}

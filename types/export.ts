/**
 * Export 类型定义
 *
 * v2.0 重构 — ExportAgent 的输入输出类型单一可信源
 * 当前 lib/agents/export.ts 仍 re-export 这些类型以保持向后兼容
 */

import type { KnowledgeCard, RecommendationOutput } from './knowledge'

export interface ExportOutput {
  markdown: string
  obsidian: string
  json: string
  mindmap: string                    // Mermaid mindmap 语法
}

/**
 * ExportAgent 的输入 payload（来自 coordinator）
 */
export interface ExportAgentInput {
  knowledgeCard: KnowledgeCard
  recommendations: RecommendationOutput
  source?: string
}

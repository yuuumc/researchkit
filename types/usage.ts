/**
 * Usage 类型定义 — D25 从 lib/usage-collector.ts 抽出
 *
 * 抽出原因：
 * - D25 引入 AsyncLocalStorage 后，lib/usage-collector.ts 变成 server-only
 * - 客户端组件（AgentTimeline / CostTab）只需 type，不需要运行时
 * - 把 type 放到 types/ 下，让客户端 import @/types/usage，避免 webpack 解析 server module
 *
 * UsageRecord — 单次 LLM 调用记录
 * AgentUsageSummary — 按 Agent 聚合的 summary
 * UsageSummary — 一次 coordinate() 调用的完整 summary
 * ChatUsage — re-export from core/llm/provider（OpenAI 兼容格式）
 */

export type { ChatUsage } from '@/core/llm/provider'

export interface UsageRecord {
  /** 调用方 Agent 名（Planner / Reader / Analyzer / ... / Reflection / Replan / KnowledgeBuilder） */
  agent: string
  /** Token 用量 */
  usage: import('@/core/llm/provider').ChatUsage
  /** 实际使用的模型名（如 'deepseek-v4-flash'） */
  model: string
  /** 调用耗时（毫秒） */
  durationMs: number
  /** 时间戳（毫秒） */
  timestamp: number
}

export interface AgentUsageSummary {
  agent: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  /** 该 Agent 的调用次数（如 Reflection 可能跑 2 轮 = 2 次） */
  calls: number
  /** 该 Agent 的总成本（USD） */
  costUsd: number
}

export interface UsageSummary {
  records: UsageRecord[]
  totalUsage: import('@/core/llm/provider').ChatUsage
  totalCostUsd: number
  perAgent: AgentUsageSummary[]
}

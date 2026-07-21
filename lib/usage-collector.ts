/**
 * Usage Collector — D6 Cost & Token Dashboard 配套
 *
 * 设计：
 * - module-level 全局 collector（接受并发竞态，评委演示场景单请求足够）
 * - coordinator 入口 beginCollection()，所有 provider.chat() 自动记录
 * - coordinator 出口 endCollection() 拿到 log，清空 collector
 * - 当前 Agent name 由 callAgent / runPlanner / reflect / replan 设置
 *
 * 数据流：
 * ```
 * Provider.chat()  →  recordUsage()       →  collector.records.push()
 * callAgent(name)  →  setCurrentAgent(name)
 * coordinator()    →  beginCollection() / endCollection()
 * ```
 *
 * 并发注意：
 * - 多请求并发时 currentCollector 会被覆盖（最新请求的 collector 生效）
 * - 旧请求结束时 endCollection() 会拿到错误的 collector
 * - 接受此限制（D6 评委演示场景单用户）
 * - 未来 v2.2 可改用 AsyncLocalStorage 解决
 */

import type { ChatUsage } from '@/core/llm/provider'
import { estimateTokenCost } from '@/core/llm/provider'

// Re-export ChatUsage — 让调用方只 import '@​/lib/usage-collector' 即可拿到所有 cost 相关类型
export type { ChatUsage } from '@/core/llm/provider'

export interface UsageRecord {
  /** 调用方 Agent 名（Planner / Reader / Analyzer / ... / Reflection / Replan / KnowledgeBuilder） */
  agent: string
  /** Token 用量 */
  usage: ChatUsage
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
  totalUsage: ChatUsage
  totalCostUsd: number
  perAgent: AgentUsageSummary[]
}

/**
 * Usage Collector — 一次 coordinate() 调用期间的 token 累加器
 */
export class UsageCollector {
  records: UsageRecord[] = []

  record(agent: string, usage: ChatUsage, model: string, durationMs: number): void {
    this.records.push({
      agent,
      usage,
      model,
      durationMs,
      timestamp: Date.now(),
    })
  }

  summarize(): UsageSummary {
    const totalUsage: ChatUsage = this.records.reduce(
      (acc, r) => ({
        promptTokens: acc.promptTokens + r.usage.promptTokens,
        completionTokens: acc.completionTokens + r.usage.completionTokens,
        totalTokens: acc.totalTokens + r.usage.totalTokens,
      }),
      { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    )

    // 按 agent 聚合
    const agentMap = new Map<string, AgentUsageSummary>()
    for (const r of this.records) {
      const existing = agentMap.get(r.agent) || {
        agent: r.agent,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        calls: 0,
        costUsd: 0,
      }
      existing.promptTokens += r.usage.promptTokens
      existing.completionTokens += r.usage.completionTokens
      existing.totalTokens += r.usage.totalTokens
      existing.calls += 1
      existing.costUsd += estimateTokenCost(r.model, r.usage)
      agentMap.set(r.agent, existing)
    }

    const perAgent = Array.from(agentMap.values()).sort((a, b) => b.totalTokens - a.totalTokens)
    const totalCostUsd = perAgent.reduce((sum, a) => sum + a.costUsd, 0)

    return {
      records: this.records,
      totalUsage,
      totalCostUsd,
      perAgent,
    }
  }
}

// ============================================================================
// module-level 状态
// ============================================================================

let currentCollector: UsageCollector | null = null
let currentAgentName: string = 'unknown'

/**
 * 开始采集 — coordinator 入口调用
 *
 * @returns 创建的 collector（用于结束时调用 summarize()）
 */
export function beginCollection(): UsageCollector {
  const collector = new UsageCollector()
  currentCollector = collector
  currentAgentName = 'unknown'
  return collector
}

/**
 * 结束采集 — coordinator 出口调用
 *
 * @returns 采集到的 records（已重置 collector）
 */
export function endCollection(): UsageRecord[] | null {
  if (!currentCollector) return null
  const records = currentCollector.records
  currentCollector = null
  currentAgentName = 'unknown'
  return records
}

/**
 * 记录一次 LLM 调用的 usage — Provider.chat() 末尾调用
 *
 * 自动归到当前 currentAgentName
 */
export function recordUsage(usage: ChatUsage, model: string, durationMs: number): void {
  if (currentCollector) {
    currentCollector.record(currentAgentName, usage, model, durationMs)
  }
}

/**
 * 设置当前 Agent name — callAgent / runPlanner / reflect / replan 入口调用
 *
 * 注意：并行执行时会有竞态（多个 callAgent 同时设置不同 name）
 * D6 接受此限制，未来 v2.2 改用 AsyncLocalStorage 解决
 */
export function setCurrentAgent(name: string): void {
  currentAgentName = name
}

/**
 * 获取当前 collector（用于测试或高级场景）
 */
export function getCurrentCollector(): UsageCollector | null {
  return currentCollector
}

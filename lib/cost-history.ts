/**
 * Cost History — D6 Cost Dashboard 持久化
 *
 * D29 升级：从 localStorage 迁移到 server-side 持久化
 * 客户端通过 fetch /api/history/cost 间接读写 .researchkit-data/cost-history.json
 *
 * 写入方：app/page.tsx — 每次收到 SSE result 时追加一条
 * 读取方：components/settings/tabs/CostTab.tsx — Summary Cards + Per-Agent + Recent Runs
 *
 * 设计：
 * - client side：async + fetch（不再用 localStorage）
 * - server side：fs.promises + 原子写入（tmp + rename）
 * - 容量上限 50 条（FIFO）
 * - 字段精简：只存 Dashboard 展示需要的字段，不存完整 knowledge card
 *
 * 迁移说明：v2.2 之前的 localStorage 数据不会自动迁移到 server-side
 */

import type { AgentUsageSummary, ChatUsage } from '@/types/usage'

const API_URL = '/api/history/cost'

export interface CostRun {
  /** 时间戳（毫秒）— 用于排序和"最近运行"表格 */
  timestamp: number
  /** 知识卡标题（截断到 60 字符） */
  title: string
  /** 输入来源（URL 或 '用户输入'） */
  source: string
  /** 输入类型 / 复杂度（来自 plan） */
  inputType: string
  complexity: string
  /** Pipeline 总耗时（毫秒） */
  totalDurationMs: number
  /** 总 token 用量 */
  totalUsage: ChatUsage
  /** 总成本（USD） */
  totalCostUsd: number
  /** 按 Agent 聚合 */
  perAgent: AgentUsageSummary[]
  /** 使用的 Provider 模型名（如 'deepseek-v4-flash'） — 取 records[0].model */
  model?: string
}

/**
 * 读取全部历史记录（按时间倒序）
 *
 * D29 — 改为 async + fetch /api/history/cost
 */
export async function loadCostHistory(): Promise<CostRun[]> {
  try {
    const res = await fetch(API_URL, { cache: 'no-store' })
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data.runs)) return []
    return data.runs as CostRun[]
  } catch (err) {
    console.warn('[cost-history] load failed:', err)
    return []
  }
}

/**
 * 追加一条记录（自动 FIFO 截断到 MAX_RUNS=50）
 *
 * D29 — 改为 async + POST /api/history/cost
 */
export async function appendCostRun(run: CostRun): Promise<void> {
  try {
    await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(run),
    })
  } catch (err) {
    console.warn('[cost-history] append failed:', err)
  }
}

/**
 * 清空全部历史记录
 *
 * D29 — 改为 async + DELETE /api/history/cost
 */
export async function clearCostHistory(): Promise<void> {
  try {
    await fetch(API_URL, { method: 'DELETE' })
  } catch (err) {
    console.warn('[cost-history] clear failed:', err)
  }
}

// ============================================================================
// 聚合辅助 — CostTab 显示历史汇总用（纯函数，不变）
// ============================================================================

export interface CostHistorySummary {
  /** 总运行次数 */
  totalRuns: number
  /** 累计 token */
  totalTokens: number
  /** 累计成本（USD） */
  totalCostUsd: number
  /** 平均成本/次（USD） */
  avgCostPerRun: number
  /** 累计耗时（毫秒） */
  totalDurationMs: number
  /** 按 Agent 聚合（所有历史合并） */
  perAgent: AgentUsageSummary[]
}

export function summarizeCostHistory(runs: CostRun[]): CostHistorySummary {
  if (runs.length === 0) {
    return {
      totalRuns: 0,
      totalTokens: 0,
      totalCostUsd: 0,
      avgCostPerRun: 0,
      totalDurationMs: 0,
      perAgent: [],
    }
  }

  const totalTokens = runs.reduce((sum, r) => sum + r.totalUsage.totalTokens, 0)
  const totalCostUsd = runs.reduce((sum, r) => sum + r.totalCostUsd, 0)
  const totalDurationMs = runs.reduce((sum, r) => sum + r.totalDurationMs, 0)

  // 合并所有 perAgent
  const agentMap = new Map<string, AgentUsageSummary>()
  for (const r of runs) {
    for (const a of r.perAgent) {
      const existing = agentMap.get(a.agent) || {
        agent: a.agent,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        calls: 0,
        costUsd: 0,
      }
      existing.promptTokens += a.promptTokens
      existing.completionTokens += a.completionTokens
      existing.totalTokens += a.totalTokens
      existing.calls += a.calls
      existing.costUsd += a.costUsd
      agentMap.set(a.agent, existing)
    }
  }
  const perAgent = Array.from(agentMap.values()).sort((a, b) => b.totalTokens - a.totalTokens)

  return {
    totalRuns: runs.length,
    totalTokens,
    totalCostUsd,
    avgCostPerRun: totalCostUsd / runs.length,
    totalDurationMs,
    perAgent,
  }
}

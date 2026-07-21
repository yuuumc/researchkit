/**
 * Cost History — D6 Cost Dashboard 持久化
 *
 * 存储：localStorage（key: 'researchkit:cost-history'）
 *
 * 写入方：app/page.tsx — 每次收到 SSE result 时追加一条
 * 读取方：components/settings/tabs/CostTab.tsx — Summary Cards + Per-Agent + Recent Runs
 *
 * 设计：
 * - 仅 client side（localStorage），不写 cookie（不需要 server 读取）
 * - 容量上限 50 条（FIFO，超出自动 pop 最旧）
 * - 字段精简：只存 Dashboard 展示需要的字段，不存完整 knowledge card
 */

import type { AgentUsageSummary, ChatUsage } from '@/lib/usage-collector'

const STORAGE_KEY = 'researchkit:cost-history'
const MAX_RUNS = 50

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

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

/**
 * 读取全部历史记录（按时间倒序）
 */
export function loadCostHistory(): CostRun[] {
  if (!isBrowser()) return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as CostRun[]
  } catch (err) {
    console.warn('[cost-history] load failed:', err)
    return []
  }
}

/**
 * 追加一条记录（自动 FIFO 截断到 MAX_RUNS）
 */
export function appendCostRun(run: CostRun): void {
  if (!isBrowser()) return
  try {
    const list = loadCostHistory()
    list.unshift(run) // 最新的放最前
    if (list.length > MAX_RUNS) list.length = MAX_RUNS
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch (err) {
    // localStorage 满或被禁用时静默失败
    console.warn('[cost-history] append failed:', err)
  }
}

/**
 * 清空全部历史记录
 */
export function clearCostHistory(): void {
  if (!isBrowser()) return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch (err) {
    console.warn('[cost-history] clear failed:', err)
  }
}

// ============================================================================
// 聚合辅助 — CostTab 显示历史汇总用
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

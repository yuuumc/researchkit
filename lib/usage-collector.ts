/**
 * Usage Collector — D6 Cost & Token Dashboard 配套
 *
 * 设计：
 * - D25 升级：用 AsyncLocalStorage 替代 module-level 全局变量
 * - coordinator 入口 beginCollection() 创建 collector + 进入新 ALS 上下文
 * - 所有 provider.chat() 自动从 ALS 上下文读 collector + agentName
 * - coordinator 出口 endCollection() 拿到 log
 *
 * 当前 Agent name 两种设置方式：
 * - 串行场景（Planner / Reflection / Replan / Chat / Explain / Compare / Playground）：
 *   `setCurrentAgent(name)` — 在当前 ALS store 上做 immutable 更新（enterWith）
 * - 并行场景（callAgent 并行执行 Reader / Analyzer / Terminology / KnowledgeBuilder / Recommendation）：
 *   `withAgent(name, () => callback)` — 创建新 ALS 子上下文，互不干扰
 *
 * 数据流：
 * ```
 * Provider.chat()  →  recordUsage()         →  ALS.store.collector.record()
 * callAgent(name)  →  withAgent(name, ...)    →  ALS.run({ collector, agentName: name })
 * coordinator()    →  beginCollection()       →  ALS.enterWith({ collector, agentName: 'unknown' })
 * ```
 *
 * D25 解决的竞态：
 * - v2.1 起 module-level currentAgentName 在 Promise.all 并行 callAgent 时被覆盖
 * - 改用 ALS 后，每个 callAgent 进入独立子上下文，agentName 不再共享
 */

import type { ChatUsage } from '@/core/llm/provider'
import { estimateTokenCost } from '@/core/llm/provider'
import type { UsageRecord, AgentUsageSummary, UsageSummary } from '@/types/usage'

// Re-export 类型 — 让调用方只 import '@/lib/usage-collector' 即可拿到所有 cost 相关类型
// D25 把 type 抽到 types/usage，避免客户端组件触发 server module 解析
export type { ChatUsage } from '@/core/llm/provider'
export type { UsageRecord, AgentUsageSummary, UsageSummary } from '@/types/usage'

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
// module-level 状态 — D25 改用 AsyncLocalStorage
// ============================================================================

interface UsageContext {
  collector: UsageCollector
  agentName: string
}

/**
 * D25：AsyncLocalStorage 类型 — 从 node:async_hooks 加载
 *
 * 客户端 bundle 中不能用 `import { AsyncLocalStorage } from 'node:async_hooks'`
 * 因为 webpack 5 不能处理 `node:` scheme（即使做 alias 也会在 resolve 阶段失败）
 *
 * 解决方案：用 `__non_webpack_require__`（webpack 提供的全局变量）绕过 webpack 静态分析
 * - server side：__non_webpack_require__ 由 webpack 注入，能直接 require node 内置模块
 * - client side：__non_webpack_require__ 不存在，AsyncLocalStorage 为 null，ALS 逻辑被跳过
 *
 * 客户端组件只 import 类型（UsageRecord / AgentUsageSummary），不会触发 ALS 实例化。
 */
type AsyncLocalStorageLike<T> = {
  enterWith(store: T): void
  getStore(): T | undefined
  run<R>(store: T, callback: () => R): R
}

let AsyncLocalStorageCtor: (new <T>() => AsyncLocalStorageLike<T>) | null = null
if (typeof window === 'undefined') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const maybeRequire = (globalThis as any).__non_webpack_require__
      ?? (typeof __non_webpack_require__ !== 'undefined' ? __non_webpack_require__ : null)
    if (maybeRequire) {
      AsyncLocalStorageCtor = maybeRequire('node:async_hooks').AsyncLocalStorage
    }
  } catch {
    // 某些 server runtime 可能不支持，fallback 到 null
  }
}

/**
 * AsyncLocalStorage 实例 — server side 才有，client side 为 null
 */
const usageAls: AsyncLocalStorageLike<UsageContext> | null = AsyncLocalStorageCtor
  ? new (AsyncLocalStorageCtor as new () => AsyncLocalStorageLike<UsageContext>)()
  : null

/**
 * 开始采集 — coordinator 入口调用
 *
 * D25 改造：进入新 ALS 上下文，store 跟随当前 async chain
 * 后续所有 await（planner / executor / workflow）共享同一 store
 *
 * @returns 创建的 collector（用于结束时调用 summarize()）
 */
export function beginCollection(): UsageCollector {
  const collector = new UsageCollector()
  if (usageAls) {
    usageAls.enterWith({ collector, agentName: 'unknown' })
  }
  return collector
}

/**
 * 结束采集 — coordinator 出口调用
 *
 * D25 改造：从当前 ALS store 读 collector（不再清空 module-level 状态）
 * store 在调用方 return 后自动被 GC 回收
 *
 * @returns 采集到的 records（如果没在 ALS 上下文中则返回 null）
 */
export function endCollection(): UsageRecord[] | null {
  const store = usageAls?.getStore()
  if (!store) return null
  return store.collector.records
}

/**
 * 记录一次 LLM 调用的 usage — Provider.chat() 末尾调用
 *
 * 自动归到当前 ALS 上下文的 agentName
 */
export function recordUsage(usage: ChatUsage, model: string, durationMs: number): void {
  const store = usageAls?.getStore()
  if (store) {
    store.collector.record(store.agentName, usage, model, durationMs)
  }
}

/**
 * 设置当前 Agent name — 串行场景用（Planner / Reflection / Replan / Chat / Explain / Compare / Playground）
 *
 * D25 改造：用 enterWith 做 immutable 更新（替换整个 store 对象）
 * 影响当前 async chain 后续所有 await，但不影响已派生的子上下文
 *
 * 注意：并行场景请改用 withAgent(name, callback)
 */
export function setCurrentAgent(name: string): void {
  const store = usageAls?.getStore()
  if (!store || !usageAls) return
  usageAls.enterWith({ collector: store.collector, agentName: name })
}

/**
 * 在指定 Agent name 上下文中执行 callback — D25 新增，并行场景用
 *
 * 用于 callAgent 并行执行：
 * - 每个 callAgent 进入独立子上下文（基于父 store 的 collector，但 agentName 不同）
 * - Promise.all 并行执行时，多个 callAgent 互不干扰
 *
 * @example
 * ```ts
 * const result = await withAgent(agent.name, () => agent.execute(ctx))
 * ```
 */
export function withAgent<T>(name: string, callback: () => Promise<T>): Promise<T> {
  const store = usageAls?.getStore()
  if (!store || !usageAls) {
    // 没有采集上下文（应该在 beginCollection 之后调用）— 直接跑，不采集
    return callback()
  }
  return usageAls.run(
    { collector: store.collector, agentName: name },
    callback
  )
}

/**
 * 获取当前 collector（用于测试或高级场景）
 *
 * D25 改造：从 ALS 上下文读
 */
export function getCurrentCollector(): UsageCollector | null {
  return usageAls?.getStore()?.collector ?? null
}

/**
 * KC History — D8 Compare Papers 配套的 Knowledge Card 持久化
 *
 * D29 升级：从 localStorage 迁移到 server-side 持久化
 * 客户端通过 fetch /api/history/kc 间接读写 .researchkit-data/kc-history.json
 *
 * 写入方：app/page.tsx — 每次生成新 KC 时追加一条
 * 读取方：components/CompareTab.tsx — 下拉选历史 KC 与当前 KC 对比
 *
 * 设计：
 * - client side：async + fetch（不再用 localStorage）
 * - server side：fs.promises + 原子写入（tmp + rename）
 * - 同时存摘要字段（id/title/field/timestamp，下拉列表用）和完整 KC（对比用）
 * - 容量上限 10 篇（FIFO）
 *
 * 迁移说明：v2.2 之前的 localStorage 数据不会自动迁移到 server-side
 * （用户首次访问后开始累积新的 server-side 历史）
 */

import type { KnowledgeCard } from '@/types/knowledge'

const API_URL = '/api/history/kc'

export interface KCHistoryEntry {
  /** 唯一 ID（timestamp + 短随机）— 用于下拉选项 key */
  id: string
  /** 时间戳（毫秒） */
  timestamp: number
  /** KC 标题（截断到 80 字符） */
  title: string
  /** 学科领域（field） */
  field: string
  /** 难度 */
  difficulty?: string
  /** 年份 */
  year?: number
  /** 输入来源（URL 或 '用户输入'） */
  source: string
  /** 完整 KnowledgeCard — 对比时使用 */
  knowledgeCard: KnowledgeCard
}

/**
 * 读取全部历史 KC（按时间倒序）
 *
 * D29 — 改为 async + fetch /api/history/kc
 */
export async function loadKCHistory(): Promise<KCHistoryEntry[]> {
  try {
    const res = await fetch(API_URL, { cache: 'no-store' })
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data.entries)) return []
    return data.entries as KCHistoryEntry[]
  } catch (err) {
    console.warn('[kc-history] load failed:', err)
    return []
  }
}

/**
 * 追加一篇 KC（自动 FIFO 截断到 MAX_KCS=10，去重同 title + 同年份 + methodology 前缀）
 *
 * D29 — 改为 async + POST /api/history/kc
 *
 * @returns 新 entry 的 id（失败返回 null）
 */
export async function appendKCToHistory(params: {
  knowledgeCard: KnowledgeCard
  source: string
}): Promise<string | null> {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        knowledgeCard: params.knowledgeCard,
        source: params.source,
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.id || null
  } catch (err) {
    console.warn('[kc-history] append failed:', err)
    return null
  }
}

/**
 * 清空全部历史
 *
 * D29 — 改为 async + DELETE /api/history/kc
 */
export async function clearKCHistory(): Promise<void> {
  try {
    await fetch(API_URL, { method: 'DELETE' })
  } catch (err) {
    console.warn('[kc-history] clear failed:', err)
  }
}

/**
 * 删除指定 id 的 KC
 *
 * D29 — 改为 async + DELETE /api/history/kc?id=xxx
 */
export async function removeKC(id: string): Promise<void> {
  try {
    await fetch(`${API_URL}?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  } catch (err) {
    console.warn('[kc-history] remove failed:', err)
  }
}

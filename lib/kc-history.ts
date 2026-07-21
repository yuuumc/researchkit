/**
 * KC History — D8 Compare Papers 配套的 Knowledge Card 持久化
 *
 * 存储：localStorage（key: 'researchkit:kc-history'）
 * 容量：最近 10 篇（FIFO，超出自动 pop 最旧）
 *
 * 写入方：app/page.tsx — 每次生成新 KC 时追加一条
 * 读取方：components/CompareTab.tsx — 下拉选历史 KC 与当前 KC 对比
 *
 * 设计：
 * - 只 client side（localStorage）
 * - 同时存摘要字段（id/title/field/timestamp，下拉列表用）和完整 KC（对比用）
 *   完整 KC 体积约 5-10KB，10 篇 ≈ 50-100KB，localStorage 5MB 上限充足
 */

import type { KnowledgeCard } from '@/types/knowledge'

const STORAGE_KEY = 'researchkit:kc-history'
const MAX_KCS = 10

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

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

/**
 * 读取全部历史 KC（按时间倒序）
 */
export function loadKCHistory(): KCHistoryEntry[] {
  if (!isBrowser()) return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as KCHistoryEntry[]
  } catch (err) {
    console.warn('[kc-history] load failed:', err)
    return []
  }
}

/**
 * 追加一篇 KC（自动 FIFO 截断到 MAX_KCS，去重同 title + 同年份）
 *
 * @returns 新 entry 的 id（用于 page.tsx 高亮"刚加入"的项）
 */
export function appendKCToHistory(params: {
  knowledgeCard: KnowledgeCard
  source: string
}): string | null {
  if (!isBrowser()) return null
  try {
    const kc = params.knowledgeCard
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const entry: KCHistoryEntry = {
      id,
      timestamp: Date.now(),
      title: String(kc.title || '(untitled)').substring(0, 80),
      field: String(kc.field || ''),
      difficulty: kc.difficulty,
      year: kc.year,
      source: String(params.source || '用户输入').substring(0, 120),
      knowledgeCard: kc,
    }

    const list = loadKCHistory()
    // 去重：完全相同 title + year + methodology 头 60 字符 视为重复
    const dedupeKey = `${entry.title}|${entry.year || ''}|${String(kc.methodology || '').substring(0, 60)}`
    const filtered = list.filter(e => {
      const k = `${e.title}|${e.year || ''}|${String(e.knowledgeCard.methodology || '').substring(0, 60)}`
      return k !== dedupeKey
    })
    filtered.unshift(entry)
    if (filtered.length > MAX_KCS) filtered.length = MAX_KCS
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
    return id
  } catch (err) {
    // localStorage 满或被禁用时静默失败
    console.warn('[kc-history] append failed:', err)
    return null
  }
}

/**
 * 按 id 查询单条 KC
 */
export function getKCById(id: string): KCHistoryEntry | null {
  const list = loadKCHistory()
  return list.find(e => e.id === id) || null
}

/**
 * 清空全部历史
 */
export function clearKCHistory(): void {
  if (!isBrowser()) return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch (err) {
    console.warn('[kc-history] clear failed:', err)
  }
}

/**
 * 删除指定 id 的 KC
 */
export function removeKC(id: string): void {
  if (!isBrowser()) return
  try {
    const list = loadKCHistory().filter(e => e.id !== id)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch (err) {
    console.warn('[kc-history] remove failed:', err)
  }
}

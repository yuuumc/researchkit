/**
 * D29 — KC History (Server-side)
 *
 * 仅在 server 端使用（API route / coordinator 等）
 * Client 通过 /api/history/kc 间接读写
 *
 * 文件：.researchkit-data/kc-history.json
 * 容量：最近 10 篇（FIFO）
 */

import { promises as fs } from 'fs'
import path from 'path'
import type { KnowledgeCard } from '@/types/knowledge'

const DATA_DIR = path.join(process.cwd(), '.researchkit-data')
const KC_FILE = path.join(DATA_DIR, 'kc-history.json')
const MAX_KCS = 10

export interface KCHistoryEntry {
  id: string
  timestamp: number
  title: string
  field: string
  difficulty?: string
  year?: number
  source: string
  knowledgeCard: KnowledgeCard
}

interface Store {
  entries: KCHistoryEntry[]
}

async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })
  } catch {}
}

async function loadStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(KC_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && Array.isArray(parsed.entries)) {
      return parsed as Store
    }
    return { entries: [] }
  } catch {
    return { entries: [] }
  }
}

async function saveStore(store: Store): Promise<void> {
  await ensureDataDir()
  const tmp = KC_FILE + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf-8')
  await fs.rename(tmp, KC_FILE)
}

function makeId(): string {
  return `kc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export async function listKCHistory(): Promise<KCHistoryEntry[]> {
  const store = await loadStore()
  return store.entries
}

export async function appendKCHistory(params: {
  knowledgeCard: KnowledgeCard
  source: string
}): Promise<string | null> {
  try {
    const kc = params.knowledgeCard
    const id = makeId()
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
    const store = await loadStore()
    // 去重：完全相同 title + year + methodology 头 60 字符
    const dedupeKey = `${entry.title}|${entry.year || ''}|${String(kc.methodology || '').substring(0, 60)}`
    store.entries = store.entries.filter(e => {
      const k = `${e.title}|${e.year || ''}|${String(e.knowledgeCard.methodology || '').substring(0, 60)}`
      return k !== dedupeKey
    })
    // 新的放最前
    store.entries.unshift(entry)
    if (store.entries.length > MAX_KCS) store.entries.length = MAX_KCS
    await saveStore(store)
    return id
  } catch (err) {
    console.warn('[kc-history-server] append failed:', err)
    return null
  }
}

export async function getKCHistoryById(id: string): Promise<KCHistoryEntry | null> {
  const store = await loadStore()
  return store.entries.find(e => e.id === id) || null
}

export async function removeKCHistory(id: string): Promise<void> {
  const store = await loadStore()
  store.entries = store.entries.filter(e => e.id !== id)
  await saveStore(store)
}

export async function clearKCHistory(): Promise<void> {
  await saveStore({ entries: [] })
}

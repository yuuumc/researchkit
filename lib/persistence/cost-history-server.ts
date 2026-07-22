/**
 * D29 — Cost History (Server-side)
 *
 * 仅在 server 端使用（API route）
 * Client 通过 /api/history/cost 间接读写
 *
 * 文件：.researchkit-data/cost-history.json
 * 容量：最近 50 条（FIFO）
 */

import { promises as fs } from 'fs'
import path from 'path'
import type { AgentUsageSummary, ChatUsage } from '@/lib/usage-collector'

const DATA_DIR = path.join(process.cwd(), '.researchkit-data')
const COST_FILE = path.join(DATA_DIR, 'cost-history.json')
const MAX_RUNS = 50

export interface CostRun {
  timestamp: number
  title: string
  source: string
  inputType: string
  complexity: string
  totalDurationMs: number
  totalUsage: ChatUsage
  totalCostUsd: number
  perAgent: AgentUsageSummary[]
  model?: string
}

interface Store {
  runs: CostRun[]
}

async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })
  } catch {}
}

async function loadStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(COST_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && Array.isArray(parsed.runs)) {
      return parsed as Store
    }
    return { runs: [] }
  } catch {
    return { runs: [] }
  }
}

async function saveStore(store: Store): Promise<void> {
  await ensureDataDir()
  const tmp = COST_FILE + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf-8')
  await fs.rename(tmp, COST_FILE)
}

export async function listCostHistory(): Promise<CostRun[]> {
  const store = await loadStore()
  return store.runs
}

export async function appendCostHistory(run: CostRun): Promise<void> {
  try {
    const store = await loadStore()
    store.runs.unshift(run)
    if (store.runs.length > MAX_RUNS) store.runs.length = MAX_RUNS
    await saveStore(store)
  } catch (err) {
    console.warn('[cost-history-server] append failed:', err)
  }
}

export async function clearCostHistory(): Promise<void> {
  await saveStore({ runs: [] })
}

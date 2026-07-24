/**
 * v2.4.0 — Agent Session Store
 *
 * 持久化"多步研究 Agent" 的会话状态，支持：
 * - 跨请求恢复（用户带 session_id 回来，Agent 能引用前序 step 的 KC）
 * - 长期记忆（materials / KC refs 落盘，session 间可引用）
 *
 * 存储路径（与 kc-history-server 一致）：
 * - 本地开发：.researchkit-data/agent-sessions.json
 * - Vercel：  /tmp/researchkit-data/agent-sessions.json（/var/task/ 只读）
 *
 * 容量策略：最近 50 个 session（FIFO），单 session 保留全部 step 详情
 *
 * 与 v2.3.3 的 memory tool 关系：
 * - memory tool：保存"用户读过哪些论文"（面向 LLM 决策去重）
 * - session store：保存"Agent 跑过哪些研究任务"（面向人/前端回看 + 跨调用引用）
 */

import { promises as fs } from 'fs'
import path from 'path'
import type { KnowledgeCard } from '@/types/knowledge'

function getDataDir(): string {
  if (process.env.VERCEL || process.env.VERCEL_ENV) {
    return '/tmp/researchkit-data'
  }
  return path.join(process.cwd(), '.researchkit-data')
}

const DATA_DIR = getDataDir()
const SESSIONS_FILE = path.join(DATA_DIR, 'agent-sessions.json')
const MAX_SESSIONS = 50

// ============================================================================
// Schema
// ============================================================================

export type SessionStepKind = 'multi-agent' | 'web' | 'arxiv' | 'memory-recall'
export type SessionStepStatus = 'pending' | 'done' | 'failed' | 'skipped'

export interface SessionStep {
  id: string
  index: number
  kind: SessionStepKind
  /** 步骤目的（planner 生成的简短描述） */
  rationale: string
  /** 输入查询（如 arxiv query / web query / 传给 coordinate 的 content） */
  query: string
  status: SessionStepStatus
  /** 成功时填的简短摘要（不是完整 KC 全文） */
  outputSummary?: string
  /** 关联到的 material_id（multi-agent / web / arxiv 都填） */
  materialId?: string
  /** 关联到的 KC（如果 step 跑了 coordinate，存完整 KC 用于后续引用） */
  knowledgeCard?: KnowledgeCard
  durationMs?: number
  costUsd?: number
  error?: string
  startedAt: number
  finishedAt?: number
}

export interface SessionMaterial {
  id: string
  title: string
  source: string
  /** 简短摘要（≤500 字），用于跨 session 引用时的快速回顾 */
  summary: string
  /** 完整文本 / URL 引用（视 kind 而异） */
  fullContent?: string
  url?: string
  field?: string
  authors?: string[]
  year?: number
  addedAt: number
}

export interface AgentSession {
  id: string
  /** 原始研究目标（用户传入的 goal） */
  goal: string
  locale: string
  /** 创建/更新时间戳（ms） */
  createdAt: number
  updatedAt: number
  status: 'running' | 'done' | 'failed' | 'cancelled'
  steps: SessionStep[]
  materials: SessionMaterial[]
  /** Agent 最后综合出的答案（含引用） */
  finalAnswer?: string
  /** 引用清单：[{ materialId, snippet }] */
  references?: Array<{ materialId: string; snippet: string; citeIndex: number }>
  /** 累计成本与 token */
  totalCostUsd?: number
  totalUsage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  /** 错误信息（status='failed' 时填） */
  error?: string
}

interface Store {
  sessions: AgentSession[]
}

// ============================================================================
// File I/O
// ============================================================================

async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })
  } catch {}
}

async function loadStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(SESSIONS_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && Array.isArray(parsed.sessions)) return parsed as Store
    return { sessions: [] }
  } catch {
    return { sessions: [] }
  }
}

async function saveStore(store: Store): Promise<void> {
  await ensureDataDir()
  const tmp = SESSIONS_FILE + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf-8')
  await fs.rename(tmp, SESSIONS_FILE)
}

function makeSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function makeStepId(): string {
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

function makeMaterialId(): string {
  return `mat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

// ============================================================================
// Public API
// ============================================================================

export async function createSession(params: {
  goal: string
  locale?: string
}): Promise<AgentSession> {
  const store = await loadStore()
  const now = Date.now()
  const session: AgentSession = {
    id: makeSessionId(),
    goal: params.goal,
    locale: params.locale || 'en',
    createdAt: now,
    updatedAt: now,
    status: 'running',
    steps: [],
    materials: [],
  }
  store.sessions.unshift(session)
  // FIFO 截断
  if (store.sessions.length > MAX_SESSIONS) {
    store.sessions = store.sessions.slice(0, MAX_SESSIONS)
  }
  await saveStore(store)
  return session
}

export async function getSession(id: string): Promise<AgentSession | null> {
  const store = await loadStore()
  return store.sessions.find(s => s.id === id) || null
}

export async function listSessions(limit = 20): Promise<AgentSession[]> {
  const store = await loadStore()
  return store.sessions.slice(0, limit)
}

export async function updateSession(
  id: string,
  patch: Partial<Omit<AgentSession, 'id' | 'createdAt'>>
): Promise<AgentSession | null> {
  const store = await loadStore()
  const idx = store.sessions.findIndex(s => s.id === id)
  if (idx < 0) return null
  const current = store.sessions[idx]
  const next: AgentSession = {
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: Date.now(),
  }
  store.sessions[idx] = next
  await saveStore(store)
  return next
}

export async function appendStep(
  sessionId: string,
  step: Omit<SessionStep, 'id' | 'index' | 'startedAt'>
): Promise<SessionStep | null> {
  const session = await getSession(sessionId)
  if (!session) return null
  const newStep: SessionStep = {
    ...step,
    id: makeStepId(),
    index: session.steps.length,
    startedAt: Date.now(),
  }
  const next: AgentSession = {
    ...session,
    steps: [...session.steps, newStep],
    updatedAt: Date.now(),
  }
  const store = await loadStore()
  const idx = store.sessions.findIndex(s => s.id === sessionId)
  if (idx >= 0) {
    store.sessions[idx] = next
    await saveStore(store)
  }
  return newStep
}

export async function addMaterial(
  sessionId: string,
  material: Omit<SessionMaterial, 'id' | 'addedAt'>
): Promise<SessionMaterial | null> {
  const session = await getSession(sessionId)
  if (!session) return null
  // 去重：同 (title + source) 视为同一份
  const dup = session.materials.find(m => m.title === material.title && m.source === material.source)
  if (dup) return dup
  const mat: SessionMaterial = {
    ...material,
    id: makeMaterialId(),
    addedAt: Date.now(),
  }
  const next: AgentSession = {
    ...session,
    materials: [...session.materials, mat],
    updatedAt: Date.now(),
  }
  const store = await loadStore()
  const idx = store.sessions.findIndex(s => s.id === sessionId)
  if (idx >= 0) {
    store.sessions[idx] = next
    await saveStore(store)
  }
  return mat
}

export async function getRecentMaterials(limit = 10): Promise<SessionMaterial[]> {
  const store = await loadStore()
  const all: SessionMaterial[] = []
  for (const s of store.sessions) {
    all.push(...s.materials)
  }
  // 按 addedAt 倒序
  all.sort((a, b) => b.addedAt - a.addedAt)
  return all.slice(0, limit)
}

export async function deleteSession(id: string): Promise<boolean> {
  const store = await loadStore()
  const before = store.sessions.length
  store.sessions = store.sessions.filter(s => s.id !== id)
  if (store.sessions.length === before) return false
  await saveStore(store)
  return true
}

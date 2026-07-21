/**
 * Project Extension 存取 — D4 PromptBuilder 配套
 *
 * 与 user-config.ts 类似的双写策略：
 * - localStorage 主存（前端读写）
 * - cookie 同步写一份（让 server side 通过 next/headers 读取）
 *
 * 数据结构：
 * ```
 * {
 *   "Reader": { appendInstructions: "...", outputPreferences: "...", updatedAt: 1690... },
 *   "Analyzer": { ... },
 *   ...
 * }
 * ```
 *
 * cookie 限制：单 cookie 最大约 4KB
 * 6 个 Agent × 平均 200 字符 = 1.2KB → 远低于 4KB
 */

import type { AgentName, ProjectExtension } from '@/core/prompt/types'

const STORAGE_KEY = 'researchkit:prompt-extensions'
const COOKIE_KEY = 'researchkit-prompt-extensions'
const COOKIE_MAX_AGE_DAYS = 365

/**
 * 客户端：读取所有 Agent 的 Project Extension
 */
export function getAllProjectExtensionsClient(): Partial<Record<AgentName, ProjectExtension>> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Partial<Record<AgentName, ProjectExtension>>
    return isValidExtensionsMap(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * 客户端：读取单个 Agent 的 Project Extension
 */
export function getProjectExtensionClient(agent: AgentName): ProjectExtension | null {
  const all = getAllProjectExtensionsClient()
  return all[agent] || null
}

/**
 * 客户端：保存单个 Agent 的 Project Extension
 *
 * @param agent Agent 名
 * @param extension 该 Agent 的 Project Extension（覆盖式写）
 */
export function saveProjectExtensionClient(agent: AgentName, extension: ProjectExtension): void {
  if (typeof window === 'undefined') return
  const all = getAllProjectExtensionsClient()
  all[agent] = { ...extension, updatedAt: Date.now() }
  persist(all)
}

/**
 * 客户端：清除单个 Agent 的 Project Extension
 */
export function clearProjectExtensionClient(agent: AgentName): void {
  if (typeof window === 'undefined') return
  const all = getAllProjectExtensionsClient()
  delete all[agent]
  persist(all)
}

/**
 * 客户端：清除所有 Agent 的 Project Extension
 */
export function clearAllProjectExtensionsClient(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
  document.cookie = `${COOKIE_KEY}=; path=/; max-age=0; SameSite=Strict`
}

function persist(extensions: Partial<Record<AgentName, ProjectExtension>>): void {
  if (typeof window === 'undefined') return
  const json = JSON.stringify(extensions)
  window.localStorage.setItem(STORAGE_KEY, json)

  const base64 = btoa(unescape(encodeURIComponent(json)))
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60
  document.cookie = `${COOKIE_KEY}=${base64}; path=/; max-age=${maxAge}; SameSite=Strict`
}

// ============================================================================
// Server side
// ============================================================================

/**
 * server side：从 cookie 读取所有 Agent 的 Project Extension
 *
 * lib/server-prompt-extensions.ts 内部调用
 */
export function getAllProjectExtensionsFromCookie(cookieValue: string | null | undefined): Partial<Record<AgentName, ProjectExtension>> {
  if (!cookieValue) return {}
  try {
    const json = decodeURIComponent(escape(atob(cookieValue)))
    const parsed = JSON.parse(json) as Partial<Record<AgentName, ProjectExtension>>
    return isValidExtensionsMap(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export const PROMPT_EXTENSIONS_COOKIE_KEY = COOKIE_KEY
export const PROMPT_EXTENSIONS_STORAGE_KEY = STORAGE_KEY

// ============================================================================
// 内部辅助
// ============================================================================

function isValidExtensionsMap(obj: unknown): obj is Partial<Record<AgentName, ProjectExtension>> {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>
  for (const value of Object.values(o)) {
    if (!value || typeof value !== 'object') return false
    const v = value as Record<string, unknown>
    // appendInstructions / outputPreferences 必须是 string 或 undefined
    if (v.appendInstructions !== undefined && typeof v.appendInstructions !== 'string') return false
    if (v.outputPreferences !== undefined && typeof v.outputPreferences !== 'string') return false
  }
  return true
}

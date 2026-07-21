/**
 * Server-side Project Extension 读取 — D4 PromptBuilder 配套
 *
 * 在 server side 从 cookie 读取用户保存的 Project Extension
 * 失败则返回空对象（fallback 到 System only）
 *
 * 使用场景：
 * - 所有 Agent 调用 PromptBuilder.build() 之前
 * - 在 Next.js server runtime 中执行（被 API route 调用）
 */

import { cookies } from 'next/headers'
import type { AgentName, ProjectExtension } from '@/core/prompt/types'
import {
  getAllProjectExtensionsFromCookie,
  PROMPT_EXTENSIONS_COOKIE_KEY,
} from './prompt-extensions'

/**
 * 获取所有 Agent 的 Project Extension（server side）
 *
 * @example
 * ```typescript
 * const extensions = getServerProjectExtensions()
 * const readerExt = extensions['Reader'] ?? null
 * const built = PromptBuilder.build({
 *   agent: 'Reader',
 *   system,
 *   project: readerExt,
 * })
 * ```
 */
export function getServerProjectExtensions(): Partial<Record<AgentName, ProjectExtension>> {
  try {
    const cookieStore = cookies()
    const cookie = cookieStore.get(PROMPT_EXTENSIONS_COOKIE_KEY)
    if (cookie) {
      return getAllProjectExtensionsFromCookie(cookie.value)
    }
  } catch (err) {
    console.warn('[server-prompt-extensions] cookie 读取失败:', err instanceof Error ? err.message : err)
  }
  return {}
}

/**
 * 获取单个 Agent 的 Project Extension（server side）
 */
export function getServerProjectExtension(agent: AgentName): ProjectExtension | null {
  const all = getServerProjectExtensions()
  return all[agent] || null
}

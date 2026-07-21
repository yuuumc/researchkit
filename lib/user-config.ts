/**
 * 用户 Provider 配置存取 — D3 Settings UI 配套
 *
 * 设计：
 * - localStorage 主存（不会随请求传输，无 4KB 限制）
 * - cookie 同步写一份（让 server side 通过 next/headers cookies() 读取）
 * - cookie 值用 base64(JSON) 编码
 *
 * cookie 限制：单 cookie 最大约 4KB
 * ProviderConfig 实际大小估算：
 *   - baseURL: ~40 chars
 *   - apiKey: ~50 chars (sk-xxx)
 *   - model: ~30 chars
 *   - type: ~10 chars
 *   - 总计: ~130 chars JSON → base64 后 ~170 chars，远低于 4KB
 *
 * 安全性：
 * - cookie SameSite=Strict 防止 CSRF
 * - cookie 不加 HttpOnly（前端 JS 也需要读取，但只在 save 时清除）
 * - apiKey 在 cookie 中存在 → 必须配合 HTTPS（生产环境）
 */

import type { ProviderConfig } from '@/core/llm/provider'

const STORAGE_KEY = 'researchkit:provider'
const COOKIE_KEY = 'researchkit-provider'
const COOKIE_MAX_AGE_DAYS = 365

/**
 * 客户端：读取用户 Provider 配置
 *
 * @returns ProviderConfig 或 null（未配置）
 */
export function getUserConfigClient(): ProviderConfig | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const config = JSON.parse(raw) as ProviderConfig
    if (!isValidProviderConfig(config)) return null
    return config
  } catch {
    return null
  }
}

/**
 * 客户端：保存用户 Provider 配置
 *
 * 同步写 localStorage + cookie（让 server side 也能读到）
 */
export function saveUserConfigClient(config: ProviderConfig): void {
  if (typeof window === 'undefined') return
  const json = JSON.stringify(config)
  window.localStorage.setItem(STORAGE_KEY, json)

  // 同步写到 cookie（base64 编码避免特殊字符问题）
  const base64 = btoa(unescape(encodeURIComponent(json)))
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60
  document.cookie = `${COOKIE_KEY}=${base64}; path=/; max-age=${maxAge}; SameSite=Strict`
}

/**
 * 客户端：清除用户 Provider 配置
 *
 * 用户点"重置"按钮时调用
 */
export function clearUserConfigClient(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
  // 让 cookie 立即过期
  document.cookie = `${COOKIE_KEY}=; path=/; max-age=0; SameSite=Strict`
}

/**
 * server side：从单个 cookie value（base64 字符串）读取用户 Provider 配置
 *
 * lib/server-provider.ts 内部调用
 * 用法：
 * ```typescript
 * const cookie = cookies().get(USER_CONFIG_COOKIE_KEY)
 * if (cookie) {
 *   const config = getUserConfigFromCookieValue(cookie.value)
 * }
 * ```
 */
export function getUserConfigFromCookieValue(cookieValue: string): ProviderConfig | null {
  try {
    const json = decodeURIComponent(escape(atob(cookieValue)))
    const config = JSON.parse(json) as ProviderConfig
    if (!isValidProviderConfig(config)) return null
    return config
  } catch {
    return null
  }
}

export const USER_CONFIG_COOKIE_KEY = COOKIE_KEY
export const USER_CONFIG_STORAGE_KEY = STORAGE_KEY

// ============================================================================
// 内部辅助
// ============================================================================

function isValidProviderConfig(config: unknown): config is ProviderConfig {
  if (!config || typeof config !== 'object') return false
  const c = config as Record<string, unknown>
  return (
    typeof c.type === 'string' &&
    typeof c.baseURL === 'string' &&
    typeof c.apiKey === 'string' &&
    typeof c.model === 'string'
  )
}

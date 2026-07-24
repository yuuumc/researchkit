/**
 * 用户 Provider 配置存取 — D3 Settings UI 配套
 *
 * 设计：
 * - localStorage 主存（不会随请求传输，无 4KB 限制，apiKey 也存这里）
 * - cookie 只存非敏感字段（type/baseURL/model），让 server side 通过 next/headers cookies() 读取 baseURL/model
 * - cookie 值用 base64(JSON) 编码
 * - cookie 设置 HttpOnly（前端 JS 不再读 cookie，统一从 localStorage 读）
 *
 * v2.3.2 安全加固（C1）：
 * - apiKey 只存 localStorage，不写 cookie
 * - cookie 改为 HttpOnly，防止 XSS 窃取非敏感配置
 * - server-provider.ts 读不到 apiKey 时回退 env
 *
 * cookie 限制：单 cookie 最大约 4KB
 * cookie 实际大小估算：
 *   - baseURL: ~40 chars
 *   - model: ~30 chars
 *   - type: ~10 chars
 *   - 总计: ~80 chars JSON → base64 后 ~110 chars，远低于 4KB
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
 * localStorage 存完整配置(含 apiKey,客户端回填表单用)
 * cookie 只存非敏感字段(type/baseURL/model)
 *
 * v2.3.3 fix — apiKey 通过独立 HttpOnly cookie 传递:
 * 调用 /api/settings/save-provider-key 端点,由 server 用 Set-Cookie 写 HttpOnly cookie
 * (JS 无法通过 document.cookie 设置真正的 HttpOnly)
 * 失败时不阻塞保存(降级到 env OPENAI_API_KEY,与旧行为一致)
 *
 * @param config 完整 ProviderConfig
 * @param syncApiKeyToServer 是否同步 apiKey 到 server HttpOnly cookie(默认 true)
 *                           重置时传 false,会发空值清除 cookie
 */
export async function saveUserConfigClient(
  config: ProviderConfig,
  syncApiKeyToServer: boolean = true
): Promise<void> {
  if (typeof window === 'undefined') return
  const json = JSON.stringify(config)
  window.localStorage.setItem(STORAGE_KEY, json)

  // v2.3.2 (C1) — 非 apiKey 字段写普通 cookie
  // v2.3.3 fix — defaultTemperature 也加入非敏感 cookie(让 Provider Tab 的温度滑块真正生效)
  const safeConfig = {
    type: config.type,
    baseURL: config.baseURL,
    model: config.model,
    defaultTemperature: config.defaultTemperature,
  }
  const base64 = btoa(unescape(encodeURIComponent(JSON.stringify(safeConfig))))
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60
  document.cookie = `${COOKIE_KEY}=${base64}; path=/; max-age=${maxAge}; SameSite=Strict`

  // v2.3.3 fix — apiKey 通过 server-side HttpOnly cookie 设置
  // 不阻塞,失败时降级(用户可继续用 env key)
  if (syncApiKeyToServer) {
    try {
      await fetch('/api/settings/save-provider-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: config.apiKey }),
      })
    } catch (err) {
      console.warn('[user-config] 同步 apiKey 到 server cookie 失败,将降级到 env key:', err instanceof Error ? err.message : err)
    }
  }
}

/**
 * 客户端：清除用户 Provider 配置
 *
 * 用户点"重置"按钮时调用
 * v2.3.3 fix — 同步清除 server apiKey cookie
 */
export async function clearUserConfigClient(): Promise<void> {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
  // 清除非敏感 cookie
  document.cookie = `${COOKIE_KEY}=; path=/; max-age=0; SameSite=Strict`
  // v2.3.3 fix — 清除 apiKey HttpOnly cookie(必须走 server 端点)
  try {
    await fetch('/api/settings/save-provider-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: '' }),
    })
  } catch (err) {
    console.warn('[user-config] 清除 apiKey cookie 失败:', err instanceof Error ? err.message : err)
  }
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

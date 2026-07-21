/**
 * 用户偏好存取 — D5 Prompt Preset + Output Locale
 *
 * 与 user-config.ts / prompt-extensions.ts 模式一致：
 * - localStorage 主存（前端读写）
 * - cookie 同步写一份（让 server side 通过 next/headers 读取）
 *
 * 数据结构：
 * ```
 * {
 *   preset: 'academic' | 'beginner' | 'developer' | 'researcher' | 'product_manager',
 *   outputLocale: 'auto' | 'zh-CN' | 'en-US' | 'ja-JP' | ...
 *   updatedAt: 1690...
 * }
 * ```
 *
 * - preset: 角色预设（影响所有 Agent 的 persona）
 * - outputLocale: 输出语言
 *   - 'auto' = 跟随源语言（v2.0 默认行为）
 *   - 'zh-CN' / 'en-US' / ... = 强制输出该语言
 */

import type { Locale } from './locale'
import type { PresetId } from '@/config/presets'
import { DEFAULT_PRESET } from '@/config/presets'

const STORAGE_KEY = 'researchkit:user-preferences'
const COOKIE_KEY = 'researchkit-user-preferences'
const COOKIE_MAX_AGE_DAYS = 365

/**
 * 用户偏好（影响所有 Agent 行为）
 */
export interface UserPreferences {
  /** 角色 preset（默认 'academic'） */
  preset: PresetId
  /**
   * 输出 locale
   * - 'auto' = 跟随源语言（默认）
   * - 'zh-CN' / 'en-US' / ... = 强制该 locale 输出
   */
  outputLocale: 'auto' | Locale
  /** 最后更新时间（毫秒） */
  updatedAt?: number
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  preset: DEFAULT_PRESET,
  outputLocale: 'auto',
}

// ============================================================================
// 客户端
// ============================================================================

export function getUserPreferencesClient(): UserPreferences {
  if (typeof window === 'undefined') return DEFAULT_USER_PREFERENCES
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_USER_PREFERENCES
    const parsed = JSON.parse(raw) as Partial<UserPreferences>
    return {
      preset: (parsed.preset && isValidPreset(parsed.preset)) ? parsed.preset : DEFAULT_PRESET,
      outputLocale: parsed.outputLocale || 'auto',
      updatedAt: parsed.updatedAt,
    }
  } catch {
    return DEFAULT_USER_PREFERENCES
  }
}

export function saveUserPreferencesClient(prefs: UserPreferences): void {
  if (typeof window === 'undefined') return
  const toSave: UserPreferences = { ...prefs, updatedAt: Date.now() }
  const json = JSON.stringify(toSave)
  window.localStorage.setItem(STORAGE_KEY, json)

  const base64 = btoa(unescape(encodeURIComponent(json)))
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60
  document.cookie = `${COOKIE_KEY}=${base64}; path=/; max-age=${maxAge}; SameSite=Strict`
}

export function clearUserPreferencesClient(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
  document.cookie = `${COOKIE_KEY}=; path=/; max-age=0; SameSite=Strict`
}

// ============================================================================
// Server side
// ============================================================================

export function getUserPreferencesFromCookie(cookieValue: string | null | undefined): UserPreferences {
  if (!cookieValue) return DEFAULT_USER_PREFERENCES
  try {
    const json = decodeURIComponent(escape(atob(cookieValue)))
    const parsed = JSON.parse(json) as Partial<UserPreferences>
    return {
      preset: (parsed.preset && isValidPreset(parsed.preset)) ? parsed.preset : DEFAULT_PRESET,
      outputLocale: parsed.outputLocale || 'auto',
      updatedAt: parsed.updatedAt,
    }
  } catch {
    return DEFAULT_USER_PREFERENCES
  }
}

export const USER_PREFERENCES_COOKIE_KEY = COOKIE_KEY
export const USER_PREFERENCES_STORAGE_KEY = STORAGE_KEY

// ============================================================================
// 内部辅助
// ============================================================================

function isValidPreset(value: unknown): value is PresetId {
  if (typeof value !== 'string') return false
  return ['academic', 'beginner', 'developer', 'researcher', 'product_manager'].includes(value)
}

/**
 * 用户偏好存取 — D5 Prompt Preset + Output Locale + D36 i18n 扩展
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
 *   appLocale: 'auto' | 'zh-CN' | 'en-US' | 'ja-JP',   // D36 新增 — Application Language
 *   autoTranslate: true | false,                       // D36 新增 — Auto Translate 开关
 *   promptLanguage: 'en-US',                            // D36 新增 — 只读,永久 'en-US'
 *   updatedAt: 1690...
 * }
 * ```
 *
 * - preset: 角色预设（影响所有 Agent 的 persona）
 * - outputLocale: KC 输出语言(职责收窄,只控制 LLM 最终输出)
 *   - 'auto' = 跟随源语言（v2.0 默认行为）
 *   - 'zh-CN' / 'en-US' / ... = 强制该 locale 输出
 * - appLocale: Application Language(D36 新增)— 控制 UI / Help / Tooltip
 *   - 'auto' = 跟随浏览器(默认,与 v2.0 之前的行为一致)
 *   - 'zh-CN' / 'en-US' / 'ja-JP' = 显式指定
 * - autoTranslate: 是否自动翻译 Explain/Chat/Compare 输出为 AppLocale(默认 true)
 * - promptLanguage: 锁死 'en-US'(只读,LLM 英文 prompt 效果最佳)
 */

import type { Locale } from './locale'
import type { AppLocale } from './locale-types'
import type { PresetId } from '@/config/presets'
import { DEFAULT_PRESET } from '@/config/presets'

const STORAGE_KEY = 'researchkit:user-preferences'
const COOKIE_KEY = 'researchkit-user-preferences'
const COOKIE_MAX_AGE_DAYS = 365

/**
 * 用户偏好（影响所有 Agent 行为 + UI 语言）
 */
export interface UserPreferences {
  /** 角色 preset（默认 'academic'） */
  preset: PresetId
  /**
   * KC 输出 locale(职责收窄,只控制 LLM 最终输出)
   * - 'auto' = 跟随源语言（默认）
   * - 'zh-CN' / 'en-US' / ... = 强制该 locale 输出
   */
  outputLocale: 'auto' | Locale
  /**
   * Application Language — D36 新增
   * 控制 UI / Help / Tooltip / Preset label
   * - 'auto' = 跟随浏览器(默认)
   * - 'zh-CN' / 'en-US' / 'ja-JP' = 显式指定
   */
  appLocale: AppLocale
  /**
   * Auto Translate — D36 新增
   * 开启后,Explain / Chat / Compare 模块的回复会自动翻译为 Application Language
   * 默认 true(对老用户来说,行为更友好)
   */
  autoTranslate: boolean
  /**
   * Prompt Language — D36 新增(只读)
   * 永远 'en-US'(LLM 英文 prompt 效果最佳)
   * 此字段不允许用户修改,仅用于 Settings UI 显示
   */
  promptLanguage: 'en-US'
  /** 最后更新时间（毫秒） */
  updatedAt?: number
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  preset: DEFAULT_PRESET,
  outputLocale: 'auto',
  // D36 新字段默认值 — 老用户数据没有这些字段时 fallback 到默认
  appLocale: 'auto',
  autoTranslate: true,
  promptLanguage: 'en-US',
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
      // D36 字段向后兼容:老数据没有这些字段时用默认值
      appLocale: parsed.appLocale ?? DEFAULT_USER_PREFERENCES.appLocale,
      autoTranslate: parsed.autoTranslate ?? DEFAULT_USER_PREFERENCES.autoTranslate,
      promptLanguage: 'en-US', // 永远 'en-US',不读用户配置
      updatedAt: parsed.updatedAt,
    }
  } catch {
    return DEFAULT_USER_PREFERENCES
  }
}

export function saveUserPreferencesClient(prefs: UserPreferences): void {
  if (typeof window === 'undefined') return
  // 强制 promptLanguage 为 'en-US'(只读字段,不接受用户修改)
  const toSave: UserPreferences = {
    ...prefs,
    promptLanguage: 'en-US',
    updatedAt: Date.now(),
  }
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
      // D36 字段向后兼容
      appLocale: parsed.appLocale ?? DEFAULT_USER_PREFERENCES.appLocale,
      autoTranslate: parsed.autoTranslate ?? DEFAULT_USER_PREFERENCES.autoTranslate,
      promptLanguage: 'en-US',
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

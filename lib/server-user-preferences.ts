/**
 * Server-side User Preferences 读取 — D5 配套
 *
 * 在 server side 从 cookie 读取用户偏好（preset + outputLocale）
 * 失败则返回默认值（'academic' preset, 'auto' locale）
 *
 * 使用场景：
 * - 所有 Agent 调用 PromptBuilder.build() 之前
 * - 在 Next.js server runtime 中执行（被 API route 调用）
 */

import { cookies } from 'next/headers'
import { type Locale } from './locale'
import {
  getUserPreferencesFromCookie,
  USER_PREFERENCES_COOKIE_KEY,
  type UserPreferences,
  DEFAULT_USER_PREFERENCES,
} from './user-preferences'

/**
 * 获取用户偏好（server side）
 *
 * @example
 * ```typescript
 * const prefs = getServerUserPreferences()
 * const built = PromptBuilder.build({
 *   agent: 'Reader',
 *   system,
 *   project: getServerProjectExtension('Reader'),
 *   preset: prefs.preset,
 * })
 * ```
 */
export function getServerUserPreferences(): UserPreferences {
  try {
    const cookieStore = cookies()
    const cookie = cookieStore.get(USER_PREFERENCES_COOKIE_KEY)
    if (cookie) {
      return getUserPreferencesFromCookie(cookie.value)
    }
  } catch (err) {
    console.warn('[server-user-preferences] cookie 读取失败:', err instanceof Error ? err.message : err)
  }
  return DEFAULT_USER_PREFERENCES
}

/**
 * 获取当前生效的 outputLocale
 *
 * - 用户偏好 'auto' → 返回 detectedLocale（跟随源语言）
 * - 用户偏好具体 locale → 返回该 locale（强制覆盖）
 *
 * @param detectedLocale LLM 自动检测的源语言 locale
 */
export function getEffectiveOutputLocale(detectedLocale: Locale): Locale {
  const prefs = getServerUserPreferences()
  if (prefs.outputLocale === 'auto') return detectedLocale
  return prefs.outputLocale
}

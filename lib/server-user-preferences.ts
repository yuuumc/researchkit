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
import type { AppLocale, ResolvedLocale } from './locale-types'
import { resolveAppLocale } from './locale-types'

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

// ============================================================================
// D39 — Auto Translate 后端逻辑
// ============================================================================

/**
 * AppLocale → LLM 友好的语言名(英文,用于 prompt)
 *
 * 仅返回 supported locales(zh-CN / en-US / ja-JP),
 * 其他 locale 由调用方处理(不追加 directive)。
 */
function appLocaleToLlmLanguageName(resolved: ResolvedLocale): string | null {
  switch (resolved) {
    case 'zh-CN': return 'Simplified Chinese (简体中文)'
    case 'en-US': return 'English (US)'
    // v2.3.3: ja-JP 已从 AppLocale 移除，但 Output Language 仍支持 ja-JP（由 LLM 处理，不经过此函数）
    default: return null
  }
}

/**
 * 构建 Auto Translate 指令 — D39
 *
 * 当用户开启 autoTranslate 时,在 LLM prompt 末尾追加指令,
 * 让 Explain / Chat / Compare 模块的回复跟随 Application Language。
 *
 * - autoTranslate=false → 返回空字符串(原行为:跟随 KC / Output Language)
 * - autoTranslate=true + appLocale='auto' → 解析为浏览器 locale(SSR 时为 'en-US')
 * - autoTranslate=true + appLocale 显式 → 追加 `Please respond in {language}.`
 *
 * @returns 追加到 system prompt 末尾的指令(可能为空字符串)
 */
export function buildAutoTranslateDirective(): string {
  const prefs = getServerUserPreferences()
  if (!prefs.autoTranslate) return ''

  const resolved: ResolvedLocale = resolveAppLocale(prefs.appLocale)
  const languageName = appLocaleToLlmLanguageName(resolved)
  if (!languageName) return ''

  return `\n\n## Output Language Override (Auto Translate)

IMPORTANT: Please respond in ${languageName}.
The user has enabled Auto Translate — your reply should be in ${languageName}, regardless of the input language.
Keep technical terms (model names, dataset names, algorithm names) in their original form.`
}


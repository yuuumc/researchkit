/**
 * Locale 类型定义 — D36 i18n 基础设施
 *
 * 区分:
 * - AppLocale:用户配置(含 'auto'),存 localStorage/cookie
 * - ResolvedLocale:解析后的实际 locale(不含 'auto')
 *
 * 4 层语言架构中,本文件只管 Application Language 这一层;
 * Output Language 仍在 lib/user-preferences.ts 的 outputLocale 字段;
 * Prompt Language 锁死 'en-US'(只读,不可改)。
 */

/**
 * 用户可配置的 Application Locale
 * - 'auto' = 跟随浏览器(默认)
 * - 'zh-CN' / 'en-US' / 'ja-JP' = 显式指定
 */
export type AppLocale = 'auto' | 'zh-CN' | 'en-US' | 'ja-JP'

/**
 * 解析后的 Locale(用于翻译资源查找)
 * - 不含 'auto'
 * - 任意 AppLocale 都可解析为 ResolvedLocale
 */
export type ResolvedLocale = Exclude<AppLocale, 'auto'>

export const DEFAULT_APP_LOCALE: AppLocale = 'auto'

export const SUPPORTED_APP_LOCALES: AppLocale[] = ['auto', 'zh-CN', 'en-US', 'ja-JP']

/**
 * 把 AppLocale(可能 'auto')解析为具体的 ResolvedLocale
 *
 * 'auto' 时调用 detectBrowserLocale(客户端)或 fallback 到 'en-US'(SSR)
 *
 * 注意:此函数依赖 detectBrowserLocale,在 SSR 时返回 'en-US'。
 *      客户端首次渲染时,服务端 HTML 是 'en-US',hydration 后会立即
 *      切换到正确语言 — 这是已知行为(类似主题切换的 FOUC)。
 *      v2.4 可通过 cookie 优化避免 SSR/CSR 不一致。
 */
export function resolveAppLocale(locale: AppLocale): ResolvedLocale {
  if (locale !== 'auto') return locale
  // 'auto' → 调 detectBrowserLocale(避免循环依赖,这里 inline 实现)
  if (typeof window === 'undefined' || !navigator) return 'en-US'
  const candidates = [navigator.language, ...(navigator.languages || [])].filter(Boolean)
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase()
    if (lower.startsWith('zh')) return 'zh-CN'
    if (lower.startsWith('en')) return 'en-US'
    if (lower.startsWith('ja')) return 'ja-JP'
  }
  return 'en-US'
}

/**
 * Locale 显示名(用于 Settings UI 下拉)
 */
export const APP_LOCALE_DISPLAY: Record<AppLocale, { label: string; flag: string; hint: string }> = {
  'auto': {
    label: 'Auto',
    flag: '🌐',
    hint: 'Follow browser language',
  },
  'zh-CN': {
    label: '中文 (简体)',
    flag: '🇨🇳',
    hint: 'Simplified Chinese',
  },
  'en-US': {
    label: 'English (US)',
    flag: '🇺🇸',
    hint: 'American English',
  },
  'ja-JP': {
    label: '日本語',
    flag: '🇯🇵',
    hint: 'Japanese (falls back to English in v2.3, full support in v2.4)',
  },
}

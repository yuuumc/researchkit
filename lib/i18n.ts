/**
 * i18n 核心库 — D36 国际化基础设施
 *
 * 设计原则:
 * - 零重型依赖(不引入 next-intl / react-i18next)
 * - 嵌套 key 通过 `.` 分隔(如 'settings.tabs.provider')
 * - t(key) 支持参数替换 {param}
 * - SSR 友好:可显式传入 locale,不依赖 React context
 *
 * 4 层语言架构(详见 docs/v2.3-i18n-plan.md):
 * - Application Language  → UI / Help / Tooltip(本文件管这层)
 * - Output Language       → KC 最终输出(在 user-preferences.ts)
 * - Prompt Language       → 锁死 English(只读)
 * - Auto Translate        → Explain/Chat 翻译开关
 */

import type { AppLocale, ResolvedLocale } from './locale-types'
import { DEFAULT_APP_LOCALE, SUPPORTED_APP_LOCALES, resolveAppLocale } from './locale-types'

// ============================================================================
// 翻译资源加载
// ============================================================================

// 静态 import JSON(Next.js + tsconfig resolveJsonModule 支持)
import zhCNCommon from '@/locales/zh-CN/common.json'
import zhCNSettings from '@/locales/zh-CN/settings.json'
import zhCNPreset from '@/locales/zh-CN/preset.json'
import zhCNHome from '@/locales/zh-CN/home.json'
import zhCNAgent from '@/locales/zh-CN/agent.json'
import zhCNExport from '@/locales/zh-CN/export.json'

import enUSCommon from '@/locales/en-US/common.json'
import enUSSettings from '@/locales/en-US/settings.json'
import enUSPreset from '@/locales/en-US/preset.json'
import enUSHome from '@/locales/en-US/home.json'
import enUSAgent from '@/locales/en-US/agent.json'
import enUSExport from '@/locales/en-US/export.json'

type Namespace = 'common' | 'settings' | 'preset' | 'home' | 'agent' | 'export'

const RESOURCES: Record<ResolvedLocale, Record<Namespace, Record<string, unknown>>> = {
  'zh-CN': {
    common: zhCNCommon as Record<string, unknown>,
    settings: zhCNSettings as Record<string, unknown>,
    preset: zhCNPreset as Record<string, unknown>,
    home: zhCNHome as Record<string, unknown>,
    agent: zhCNAgent as Record<string, unknown>,
    export: zhCNExport as Record<string, unknown>,
  },
  'en-US': {
    common: enUSCommon as Record<string, unknown>,
    settings: enUSSettings as Record<string, unknown>,
    preset: enUSPreset as Record<string, unknown>,
    home: enUSHome as Record<string, unknown>,
    agent: enUSAgent as Record<string, unknown>,
    export: enUSExport as Record<string, unknown>,
  },
  // ja-JP / 其他:暂 fallback 到 en-US(v2.4 再补)
  'ja-JP': {
    common: enUSCommon as Record<string, unknown>,
    settings: enUSSettings as Record<string, unknown>,
    preset: enUSPreset as Record<string, unknown>,
    home: enUSHome as Record<string, unknown>,
    agent: enUSAgent as Record<string, unknown>,
    export: enUSExport as Record<string, unknown>,
  },
}

// ============================================================================
// 核心 t() 函数
// ============================================================================

/**
 * 翻译函数
 *
 * @param key   命名空间 + 嵌套路径,如 'settings.tabs.provider'
 * @param params 替换 {param} 占位符
 * @param locale 显式指定 locale(不传则用 default)
 * @returns 翻译后的字符串;找不到时返回 key 本身(fallback)
 *
 * @example
 * t('settings.tabs.provider')                    // → '模型' (zh-CN) / 'Provider' (en-US)
 * t('home.errors.urlTooShort', { len: 12 })      // → '...过短（12 字符）...'
 * t('settings.general.usingCustom', { preset: 'Academic', outputLocale: 'auto' }, 'en-US')
 */
export function t(
  key: string,
  params?: Record<string, string | number>,
  locale: ResolvedLocale | AppLocale = DEFAULT_APP_LOCALE,
): string {
  const resolved = resolveAppLocale(locale)

  // 解析 namespace(第一段)
  const firstDot = key.indexOf('.')
  if (firstDot === -1) return key // 无 namespace,直接返回 key
  const ns = key.substring(0, firstDot) as Namespace
  const path = key.substring(firstDot + 1)

  const namespace = RESOURCES[resolved]?.[ns]
  if (!namespace) return key

  const value = getByPath(namespace, path)
  if (typeof value !== 'string') return key

  return params ? interpolate(value, params) : value
}

// ============================================================================
// 浏览器 locale 检测
// ============================================================================

/**
 * 检测浏览器 locale — 用于 Application Language = 'auto' 时
 *
 * 解析 navigator.language / navigator.languages:
 * - 'zh-CN' / 'zh' → 'zh-CN'
 * - 'en-US' / 'en' → 'en-US'
 * - 'ja-JP' / 'ja' → 'ja-JP'
 * - 其他 / 未知 → 'en-US'(fallback)
 *
 * SSR 安全:window 不存在时返回 'en-US'
 */
export function detectBrowserLocale(): ResolvedLocale {
  if (typeof window === 'undefined' || !navigator) return 'en-US'

  const candidates = [
    navigator.language,
    ...(navigator.languages || []),
  ].filter(Boolean)

  for (const candidate of candidates) {
    const lower = candidate.toLowerCase()
    if (lower.startsWith('zh')) return 'zh-CN'
    if (lower.startsWith('en')) return 'en-US'
    if (lower.startsWith('ja')) return 'ja-JP'
  }

  return 'en-US'
}

// ============================================================================
// Cookie 存取(SSR 支持)
// ============================================================================

export const APP_LOCALE_COOKIE_KEY = 'researchkit-app-locale'
export const APP_LOCALE_STORAGE_KEY = 'researchkit:app-locale'

/**
 * 客户端:读取 Application Locale
 * 优先级:localStorage > cookie > detectBrowserLocale
 */
export function getAppLocaleClient(): AppLocale {
  if (typeof window === 'undefined') return DEFAULT_APP_LOCALE

  // 1. localStorage
  try {
    const stored = window.localStorage.getItem(APP_LOCALE_STORAGE_KEY)
    if (stored && SUPPORTED_APP_LOCALES.includes(stored as AppLocale)) {
      return stored as AppLocale
    }
  } catch {
    // localStorage 不可用(隐私模式),fallback 到 cookie
  }

  // 2. cookie
  const cookieValue = readCookie(APP_LOCALE_COOKIE_KEY)
  if (cookieValue && SUPPORTED_APP_LOCALES.includes(cookieValue as AppLocale)) {
    return cookieValue as AppLocale
  }

  // 3. 默认 'auto'(让 resolveAppLocale 在渲染时调 detectBrowserLocale)
  return DEFAULT_APP_LOCALE
}

/**
 * 客户端:保存 Application Locale
 * 同步写 localStorage + cookie(让 SSR 通过 next/headers 也能读到)
 */
export function setAppLocaleClient(locale: AppLocale): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, locale)
  } catch {
    // localStorage 不可用,只写 cookie
  }

  const maxAge = 365 * 24 * 60 * 60
  document.cookie = `${APP_LOCALE_COOKIE_KEY}=${locale}; path=/; max-age=${maxAge}; SameSite=Strict`
}

/**
 * Server side:从 cookie value 读取 Application Locale
 */
export function getAppLocaleFromCookie(cookieValue: string | null | undefined): AppLocale {
  if (!cookieValue) return DEFAULT_APP_LOCALE
  if (SUPPORTED_APP_LOCALES.includes(cookieValue as AppLocale)) {
    return cookieValue as AppLocale
  }
  return DEFAULT_APP_LOCALE
}

// ============================================================================
// 内部辅助
// ============================================================================

function getByPath(obj: unknown, path: string): unknown {
  const segments = path.split('.')
  let current: unknown = obj
  for (const seg of segments) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[seg]
  }
  return current
}

function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  })
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

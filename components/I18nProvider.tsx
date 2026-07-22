'use client'

/**
 * I18nProvider — D36 i18n 基础设施
 *
 * 职责:
 * - 提供 React Context(I18nContext)给所有 'use client' 组件
 * - 监听 localStorage 'researchkit:app-locale'
 * - 跨标签页同步(storage 事件)
 * - 暴露 useI18n() hook,返回 { locale, t, setLocale }
 *
 * 使用方式:
 * ```tsx
 * // app/layout.tsx 包裹
 * <I18nProvider>
 *   <Home />
 * </I18nProvider>
 *
 * // 任意 client component
 * const { t, locale } = useI18n()
 * t('settings.tabs.provider')  // → '模型' or 'Provider'
 * ```
 *
 * SSR 行为:
 * - 服务端渲染时 locale = 'auto'(cookie 未读到时)
 * - 客户端 mount 后,useEffect 读取 localStorage + 浏览器 locale
 * - 已知会有"hydration 不一致"风险(类似主题切换 FOUC)
 *   v2.4 通过在 <html lang> 注入 cookie 解决
 */

import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react'
import {
  t as tFn,
  getAppLocaleClient,
  setAppLocaleClient,
  detectBrowserLocale,
} from '@/lib/i18n'
import {
  type AppLocale,
  type ResolvedLocale,
  resolveAppLocale,
  DEFAULT_APP_LOCALE,
} from '@/lib/locale-types'

interface I18nContextValue {
  /** 用户配置的 AppLocale(可能 'auto') */
  appLocale: AppLocale
  /** 解析后的实际 locale(不含 'auto') */
  resolvedLocale: ResolvedLocale
  /** 翻译函数(已绑定当前 locale) */
  t: (key: string, params?: Record<string, string | number>) => string
  /** 切换 Application Language */
  setLocale: (locale: AppLocale) => void
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  // 服务端渲染时用 DEFAULT_APP_LOCALE('auto'),客户端 mount 后切换
  const [appLocale, setAppLocaleState] = useState<AppLocale>(DEFAULT_APP_LOCALE)
  const [hydrated, setHydrated] = useState(false)

  // 客户端 mount 后读取 localStorage
  useEffect(() => {
    setAppLocaleState(getAppLocaleClient())
    setHydrated(true)
  }, [])

  // 监听跨标签页 localStorage 变化
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === 'researchkit:app-locale' && e.newValue) {
        setAppLocaleState(e.newValue as AppLocale)
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const setLocale = useCallback((locale: AppLocale) => {
    setAppLocaleClient(locale)
    setAppLocaleState(locale)
  }, [])

  // 解析 'auto' → 具体 locale
  const resolvedLocale = useMemo<ResolvedLocale>(() => {
    if (!hydrated) {
      // SSR / 首次渲染前:'auto' 在服务端解析为 'en-US',避免 hydration mismatch
      return appLocale === 'auto' ? 'en-US' : appLocale
    }
    return resolveAppLocale(appLocale)
  }, [appLocale, hydrated])

  // 绑定当前 locale 的 t 函数
  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      return tFn(key, params, resolvedLocale)
    },
    [resolvedLocale],
  )

  const value = useMemo<I18nContextValue>(
    () => ({
      appLocale,
      resolvedLocale,
      t,
      setLocale,
    }),
    [appLocale, resolvedLocale, t, setLocale],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/**
 * useI18n — 读取 I18n Context
 *
 * @example
 * const { t, locale, setLocale } = useI18n()
 * t('settings.tabs.provider')  // → '模型' / 'Provider'
 * setLocale('zh-CN')
 */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    // 未在 Provider 内使用 — 返回 fallback(让单测 / SSR 不 crash)
    return {
      appLocale: DEFAULT_APP_LOCALE,
      resolvedLocale: 'en-US',
      t: (key) => key,
      setLocale: () => {
        console.warn('I18nProvider not mounted; setLocale is no-op')
      },
    }
  }
  return ctx
}

/**
 * useResolvedLocale — 只读取当前解析后的 locale(轻量版)
 * 不需要 t 函数时用这个,避免 useMemo 重建 t 函数
 */
export function useResolvedLocale(): ResolvedLocale {
  return useI18n().resolvedLocale
}

/**
 * useDetectBrowserLocale — 触发一次浏览器 locale 检测
 * 用于 Settings UI 中显示"检测到的浏览器语言"
 */
export function useDetectBrowserLocale(): ResolvedLocale | null {
  const [locale, setLocale] = useState<ResolvedLocale | null>(null)
  useEffect(() => {
    setLocale(detectBrowserLocale())
  }, [])
  return locale
}

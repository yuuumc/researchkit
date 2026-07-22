'use client'

/**
 * LanguageDetectBanner — D39 Auto Translate + 智能检测
 *
 * 数据流：
 * 1. 监听输入文本变化(防抖 300ms)
 * 2. 调用 detectInputLanguage() 得到 DetectResult
 * 3. 调用 getLanguageSuggestion() 判断是否需要建议
 * 4. 渲染：
 *    - 检测结果行：🇨🇳 Detected: Chinese ✓ (置信度 95%)
 *    - 详情可折叠：中文字符 N · 拉丁字母 M · ...
 *    - 智能建议（若有）：💡 建议切换 Output 到中文 → [一键切换] [忽略]
 *
 * 设计:
 * - 文本少于 20 字符不显示(避免误判)
 * - 用户点 "切换到 X" → 调用 onApplySuggestion(suggested)
 *   由 page.tsx 负责写入 UserPreferences 并 saveUserPreferencesClient
 * - 用户点 "忽略" → 本次会话不再显示该建议(基于 detected locale 记忆)
 */

import { useState, useEffect, useMemo } from 'react'
import { useI18n } from '@/components/I18nProvider'
import {
  detectInputLanguage,
  getLanguageSuggestion,
  localeDisplayNameShort,
  localeFlag,
} from '@/lib/detect-language'
import type { Locale } from '@/lib/locale'
import type { AppLocale } from '@/lib/locale-types'

export interface LanguageDetectBannerProps {
  /** 输入文本(text/url 主体内容) */
  input: string
  /** 用户当前 Application Language */
  appLocale: AppLocale
  /** 用户当前 Output Language */
  outputLocale: 'auto' | Locale
  /** 用户应用建议 — 由父组件负责写入 prefs + setLocale 等 */
  onApplySuggestion?: (suggested: Locale) => void
}

export function LanguageDetectBanner({
  input,
  appLocale,
  outputLocale,
  onApplySuggestion,
}: LanguageDetectBannerProps) {
  const { t } = useI18n()
  const [debouncedInput, setDebouncedInput] = useState(input)
  const [showDetails, setShowDetails] = useState(false)
  // 已忽略的建议(按 detected locale 记忆,本次会话不再弹)
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<Locale>>(new Set())

  // 防抖 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedInput(input), 300)
    return () => clearTimeout(timer)
  }, [input])

  // 检测结果(只在 input 变化时重新计算)
  const detectResult = useMemo(() => {
    if (!debouncedInput || debouncedInput.trim().length < 20) return null
    return detectInputLanguage(debouncedInput)
  }, [debouncedInput])

  // 智能建议
  const suggestion = useMemo(() => {
    if (!detectResult) return null
    if (dismissedSuggestions.has(detectResult.detected)) return null
    return getLanguageSuggestion(detectResult.detected, appLocale, outputLocale)
  }, [detectResult, appLocale, outputLocale, dismissedSuggestions])

  // 文本过短不显示
  if (!detectResult) return null

  const detectedLabel = t(`home.detect.locales.${detectResult.detected}`)
  const detectedFlag = localeFlag(detectResult.detected)
  const confidencePercent = Math.round(detectResult.confidence * 100)

  const handleDismiss = () => {
    setDismissedSuggestions(prev => {
      const next = new Set(prev)
      next.add(detectResult.detected)
      return next
    })
  }

  const handleApply = () => {
    if (suggestion && onApplySuggestion) {
      onApplySuggestion(suggestion.suggestedOutput)
    }
  }

  return (
    <div
      style={{
        marginTop: '12px',
        padding: '10px 14px',
        background: 'linear-gradient(135deg, #f0f9ff 0%, #eef2ff 100%)',
        borderRadius: '10px',
        border: '1px solid #c7d2fe',
        fontSize: '12px',
        color: '#1e293b',
        animation: 'fadeIn 0.3s ease-out',
      }}
    >
      {/* 检测结果行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '14px' }}>{detectedFlag}</span>
        <span style={{ fontWeight: 600, color: '#0f1729' }}>
          {t('home.detect.detectedLabel')}: {detectedLabel}
        </span>
        <span style={{ color: '#10b981', fontWeight: 700 }}>✓</span>
        <span style={{ color: '#64748b', fontSize: '11px' }}>
          · {t('home.detect.confidence', { percent: confidencePercent })}
        </span>
        <button
          onClick={() => setShowDetails(!showDetails)}
          style={{
            marginLeft: 'auto',
            padding: '2px 8px',
            background: 'white',
            border: '1px solid #cbd5e1',
            borderRadius: '4px',
            color: '#475569',
            fontSize: '10px',
            cursor: 'pointer',
          }}
        >
          {showDetails ? '▾' : '▸'} {t('home.detect.detailsTitle')}
        </button>
      </div>

      {/* 详情可折叠 */}
      {showDetails && (
        <div
          style={{
            marginTop: '8px',
            padding: '8px 10px',
            background: 'white',
            borderRadius: '6px',
            fontSize: '11px',
            color: '#475569',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: '4px 12px',
          }}
        >
          <DetailItem label={t('home.detect.details.chinese')} count={detectResult.counts.chinese} />
          <DetailItem label={t('home.detect.details.hiragana')} count={detectResult.counts.hiragana} />
          <DetailItem label={t('home.detect.details.katakana')} count={detectResult.counts.katakana} />
          <DetailItem label={t('home.detect.details.korean')} count={detectResult.counts.korean} />
          <DetailItem label={t('home.detect.details.latin')} count={detectResult.counts.latin} />
          <div style={{ color: '#94a3b8', gridColumn: '1 / -1' }}>
            {t('home.detect.sampleSize', { size: detectResult.sampleSize })}
          </div>
        </div>
      )}

      {/* 智能建议(若有) */}
      {suggestion && (
        <div
          style={{
            marginTop: '10px',
            padding: '10px 12px',
            background: '#fef3c7',
            border: '1px solid #fcd34d',
            borderRadius: '8px',
            fontSize: '12px',
            color: '#92400e',
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '4px' }}>
            {t('home.detect.suggestionTitle')}
          </div>
          <div style={{ marginBottom: '8px' }}>
            {t('home.detect.suggestionHint', {
              detected: detectedLabel,
              appLocale: t(`home.detect.locales.${suggestion.suggestedOutput}`),
              suggested: t(`home.detect.locales.${suggestion.suggestedOutput}`),
            })}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={handleApply}
              style={{
                padding: '6px 12px',
                background: '#92400e',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {t('home.detect.applySuggestion', {
                suggested: localeDisplayNameShort(suggestion.suggestedOutput),
              })}
            </button>
            <button
              onClick={handleDismiss}
              style={{
                padding: '6px 12px',
                background: 'white',
                color: '#92400e',
                border: '1px solid #fcd34d',
                borderRadius: '6px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              {t('home.detect.dismiss')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function DetailItem({ label, count }: { label: string; count: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
      <span>{label}</span>
      <span style={{ fontWeight: 600, color: count > 0 ? '#0f1729' : '#cbd5e1' }}>{count}</span>
    </div>
  )
}

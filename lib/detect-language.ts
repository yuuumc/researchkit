/**
 * 输入语言检测 + 智能建议 — D39 Auto Translate + 智能检测
 *
 * 设计:
 * - 底层复用 lib/locale.ts 的 detectLocale(Unicode 范围统计)
 * - 上层封装为 detectInputLanguage() 返回结构化结果
 * - getLanguageSuggestion() 根据当前 appLocale / outputLocale / 检测语言
 *   返回是否需要建议用户切换 Output Language
 *
 * 智能建议触发条件(满足全部):
 * 1. appLocale != 'auto' (用户已显式选择 UI 语言)
 * 2. outputLocale == 'auto' (Output 跟随源语言)
 * 3. detectedLocale != appLocaleResolved (源语言与 UI 语言不同)
 *
 * 例如:
 *   appLocale='zh-CN', outputLocale='auto', detected='en-US'
 *   → 建议切换 Output 到 'zh-CN'(让 KC 输出中文,而非跟随英文源)
 */

import { detectLocale, type Locale } from './locale'
import type { AppLocale, ResolvedLocale } from './locale-types'
import { resolveAppLocale } from './locale-types'

/**
 * 检测结果
 */
export interface DetectResult {
  /** 检测到的源语言 Locale */
  detected: Locale
  /** 检测用的样本字符数(前 N 个字符) */
  sampleSize: number
  /** 各字符类别计数(用于调试 / 详情展示) */
  counts: {
    chinese: number
    hiragana: number
    katakana: number
    korean: number
    latin: number
  }
  /** 置信度 (0-1, 简单启发式: 主导字符比例) */
  confidence: number
}

/**
 * 检测输入文本的语言
 *
 * @param text 输入文本(论文摘要 / 全文 / URL 等)
 * @returns DetectResult
 */
export function detectInputLanguage(text: string): DetectResult {
  const sample = (text || '').substring(0, 2000)
  const counts = {
    chinese: (sample.match(/[\u4e00-\u9fff]/g) || []).length,
    hiragana: (sample.match(/[\u3040-\u309f]/g) || []).length,
    katakana: (sample.match(/[\u30a0-\u30ff]/g) || []).length,
    korean: (sample.match(/[\uac00-\ud7af]/g) || []).length,
    latin: (sample.match(/[a-zA-Z]/g) || []).length,
  }

  const detected = detectLocale(sample)
  const totalChars =
    counts.chinese +
    counts.hiragana +
    counts.katakana +
    counts.korean +
    counts.latin

  // 简单置信度:主导字符类别占总字符的比例
  let dominantCount = counts.latin
  if (detected === 'zh-CN') dominantCount = counts.chinese
  else if (detected === 'ja-JP') dominantCount = counts.hiragana + counts.katakana
  else if (detected === 'ko-KR') dominantCount = counts.korean

  const confidence = totalChars > 0 ? dominantCount / totalChars : 0

  return {
    detected,
    sampleSize: sample.length,
    counts,
    confidence,
  }
}

/**
 * 智能建议 — 是否建议用户切换 Output Language
 *
 * @param detected 检测到的源语言
 * @param appLocale 用户当前 Application Language
 * @param outputLocale 用户当前 Output Language
 *
 * @returns 建议的 Output Locale(若应显示建议);null 表示不显示
 */
export function getLanguageSuggestion(
  detected: Locale,
  appLocale: AppLocale,
  outputLocale: 'auto' | Locale,
): { suggestedOutput: Locale; reason: 'app_output_mismatch' } | null {
  // 只在 output='auto' 时建议(若用户已显式选 Output,尊重其选择)
  if (outputLocale !== 'auto') return null

  // 'auto' appLocale 时也建议(SSR 期或浏览器跟随)— 但建议值用 resolved locale
  const resolvedApp: ResolvedLocale = resolveAppLocale(appLocale)

  // 源语言与 appLocale 相同 → 无需建议(例如中文输入 + 中文 UI)
  if (detected === resolvedApp) return null

  // detected='other' 时不建议(无法判断)
  if (detected === 'other') return null

  // 建议把 Output 切换到 appLocale 对应的 Locale
  // (用户看中文 UI,则建议 KC 也输出中文)
  return {
    suggestedOutput: resolvedApp,
    reason: 'app_output_mismatch',
  }
}

/**
 * Locale → 显示名(供 UI 展示检测结果)
 */
export function localeDisplayNameShort(locale: Locale): string {
  const map: Record<Locale, string> = {
    'zh-CN': '中文',
    'en-US': 'English',
    'ja-JP': '日本語',
    'ko-KR': '한국어',
    'fr-FR': 'Français',
    'de-DE': 'Deutsch',
    'es-ES': 'Español',
    'other': 'Unknown',
  }
  return map[locale] || 'Unknown'
}

/**
 * Locale → 国旗 emoji
 */
export function localeFlag(locale: Locale): string {
  const map: Record<Locale, string> = {
    'zh-CN': '🇨🇳',
    'en-US': '🇺🇸',
    'ja-JP': '🇯🇵',
    'ko-KR': '🇰🇷',
    'fr-FR': '🇫🇷',
    'de-DE': '🇩🇪',
    'es-ES': '🇪🇸',
    'other': '🌐',
  }
  return map[locale] || '🌐'
}

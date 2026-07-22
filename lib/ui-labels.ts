/**
 * UI 标签多语言映射
 *
 * v2.0 — 从 app/page.tsx 抽出
 * v2.3 D38 — 重构为跟随 Application Language 而非 KC 输入语言
 *
 * 4 层语言架构:
 * - KC 字段标签 → 跟随 Application Language (本文件管这层)
 * - KC 内容     → 跟随 Output Language (在 user-preferences.ts)
 * - Prompt      → 锁死 English
 *
 * 调用方:
 * - 客户端:从 useI18n() hook 获取 resolvedLocale
 * - 服务端:从 cookie 解析 ResolvedLocale
 */

import { t } from './i18n'
import type { ResolvedLocale } from './locale-types'

export interface UiLabels {
  knowledgeCard: string
  authors: string
  field: string
  year: string
  difficulty: string
  readingTime: string
  min: string
  takeaway: string
  whyItMatters: string
  whatSurprised: string
  whoShouldRead: string
  summary: string
  researchGoals: string
  innovation: string
  methodology: string
  experiments: string
  results: string
  limitations: string
  futureWork: string
  applications: string
  datasets: string
  keyTerms: string
  recommendations: string
  references: string
  structure: string
  andOthers: string
  quality: string
  completeness: string
  confidence: string
  evidence: string
  tags: string
  generatedBy: string
}

/**
 * 按 Application Locale 获取 KC 字段标签
 *
 * v2.3 D38 改造:
 * - 旧 `getLabels(kcLanguage, kcLocale)` 根据 KC 输入语言决定标签
 *   导致"中文 UI + 英文论文 → 标签英文"
 * - 新 `getKcFieldLabels(appLocale)` 跟随 Application Language
 *   切 UI 语言 → KC 字段标签即时切换
 *
 * @param appLocale ResolvedLocale (不含 'auto')
 */
export function getKcFieldLabels(appLocale: ResolvedLocale): UiLabels {
  return {
    knowledgeCard: t('home.knowledgeCard', undefined, appLocale),
    authors: t('home.fields.authors', undefined, appLocale),
    field: t('home.fields.field', undefined, appLocale),
    year: t('home.fields.year', undefined, appLocale),
    difficulty: t('home.fields.difficulty', undefined, appLocale),
    readingTime: t('home.fields.readingTime', undefined, appLocale),
    min: t('home.fields.min', undefined, appLocale),
    takeaway: t('home.fields.takeaway', undefined, appLocale),
    whyItMatters: t('home.fields.whyItMatters', undefined, appLocale),
    whatSurprised: t('home.fields.whatSurprised', undefined, appLocale),
    whoShouldRead: t('home.fields.whoShouldRead', undefined, appLocale),
    summary: t('home.fields.summary', undefined, appLocale),
    researchGoals: t('home.fields.researchGoals', undefined, appLocale),
    innovation: t('home.fields.innovation', undefined, appLocale),
    methodology: t('home.fields.methodology', undefined, appLocale),
    experiments: t('home.fields.experiments', undefined, appLocale),
    results: t('home.fields.results', undefined, appLocale),
    limitations: t('home.fields.limitations', undefined, appLocale),
    futureWork: t('home.fields.futureWork', undefined, appLocale),
    applications: t('home.fields.applications', undefined, appLocale),
    datasets: t('home.fields.datasets', undefined, appLocale),
    keyTerms: t('home.fields.keyTerms', undefined, appLocale),
    recommendations: t('home.fields.recommendations', undefined, appLocale),
    references: t('home.fields.references', undefined, appLocale),
    structure: t('home.fields.structure', undefined, appLocale),
    andOthers: t('home.fields.andOthers', undefined, appLocale),
    quality: t('home.fields.quality', undefined, appLocale),
    completeness: t('home.fields.completeness', undefined, appLocale),
    confidence: t('home.fields.confidence', undefined, appLocale),
    evidence: t('home.fields.evidence', undefined, appLocale),
    tags: t('home.fields.tags', undefined, appLocale),
    generatedBy: t('home.fields.generatedBy', undefined, appLocale),
  }
}

/**
 * @deprecated 改用 getKcFieldLabels(appLocale)
 *
 * 旧 API — 根据 KC 输入语言决定标签
 * 保留是为了过渡期兼容(如有遗漏调用点),内部 fallback 到新 API
 *
 * @param language KC 输入语言 ('zh' / 'en' / undefined)
 * @param locale   KC 输入 locale ('zh-CN' / 'en-US' / undefined)
 */
export function getLabels(language?: string, locale?: string): UiLabels {
  const isZh = language === 'zh' || locale === 'zh-CN'
  return getKcFieldLabels(isZh ? 'zh-CN' : 'en-US')
}

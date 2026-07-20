/**
 * 知识卡类型定义
 *
 * v2.0 重构 — 从 lib/agents/*.ts 中抽出，作为单一可信源
 *
 * 当前各 agent 文件仍 re-export 这些类型以保持向后兼容：
 *   import { ReaderOutput } from '@/lib/agents/reader'
 *   → 实际来自 '@/types/knowledge'
 */

import type { Locale } from '@/lib/locale'

// ============================================================================
// Reader
// ============================================================================

export interface ReaderOutput {
  // ===== 旧字段（向后兼容 KnowledgeBuilder） =====
  summary: string
  keyPassages: string[]
  structure: string
  readingTimeMin: number
  authors: string[]

  // ===== 价值导向字段 =====
  takeaway: string
  whyItMatters: string
  whatSurprised: string
  whoShouldRead: string[]
  readingDifficulty: 'Beginner' | 'Intermediate' | 'Advanced'

  // ===== 检测到的输入语言 =====
  language: 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es' | 'other'
  locale?: Locale
}

// ============================================================================
// Analyzer
// ============================================================================

export const ANALYZER_FIELDS = [
  'authors', 'field', 'year', 'researchGoals', 'innovation',
  'methodology', 'experiments', 'results', 'limitations',
  'futureWork', 'applications', 'datasets', 'structure',
] as const

export type AnalyzerField = typeof ANALYZER_FIELDS[number]

export interface AnalyzerOutput {
  // 旧字段（向后兼容）
  coreArguments: string[]
  methodology: string
  actionableTakeaways: string[]
  limitations: string[]

  // 新字段
  authors: string[]
  field: string
  year?: number
  researchGoals: string[]
  innovation: string[]
  experiments: string[]
  results: string[]
  futureWork: string[]
  applications: string[]
  datasets: string[]
  structure: string
}

export const DEFAULT_SCHEMA_BY_INPUT_TYPE: Record<string, AnalyzerField[]> = {
  paper: ['authors', 'field', 'year', 'researchGoals', 'innovation', 'methodology', 'experiments', 'results', 'limitations', 'futureWork', 'datasets', 'structure'],
  documentation: ['innovation', 'methodology', 'applications', 'structure'],
  url: ['innovation', 'methodology', 'applications', 'structure'],
  general_text: ['innovation', 'methodology', 'structure'],
  unknown: ['authors', 'field', 'year', 'researchGoals', 'innovation', 'methodology', 'experiments', 'results', 'limitations', 'futureWork', 'applications', 'datasets', 'structure'],
}

// ============================================================================
// Terminology
// ============================================================================

export interface TerminologyTerm {
  term: string
  definition: string
  category: 'concept' | 'method' | 'tool' | 'metric'
  importance: 1 | 2 | 3 | 4 | 5
  prerequisite: string[]
}

export interface TerminologyOutput {
  terms: TerminologyTerm[]
}

// ============================================================================
// Knowledge Card
// ============================================================================

export interface KnowledgeCardEvaluation {
  completeness: number          // 0-100, 核心字段填充率
  confidence: number            // 0-100, 字段质量分
  evidence: 'Strong' | 'Medium' | 'Weak'
  filled_fields: string[]
  missing_fields: string[]
}

export interface KnowledgeCard {
  // 基础
  title: string
  authors: string[]
  field: string
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced'
  year?: number

  // 检测到的输入语言
  language?: 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es' | 'other'
  locale?: Locale

  // 核心（来自 Analyzer）
  summary: string
  research_goals: string[]
  innovation: string[]
  methodology: string
  experiments: string[]
  results: string[]
  limitations: string[]
  future_work: string[]

  // Reader 价值导向
  takeaway?: string
  why_it_matters?: string
  what_surprised?: string
  who_should_read?: string[]

  // 术语（含 importance + prerequisite）
  key_terms: Array<{
    term: string
    definition: string
    category?: 'concept' | 'method' | 'tool' | 'metric'
    importance?: 1 | 2 | 3 | 4 | 5
    prerequisite?: string[]
  }>

  // 应用 & 关联
  applications: string[]
  datasets: string[]
  citations: string[]
  references: string[]

  // 元数据
  reading_time_min?: number
  structure?: string
  tags: string[]

  // 评分
  evaluation?: KnowledgeCardEvaluation
}

// ============================================================================
// Recommendation
// ============================================================================

export type RecommendationIntent = 'improve' | 'challenge' | 'apply' | 'survey'

export interface RecommendedResource {
  title: string
  url: string
  reason: string
  type: 'paper' | 'doc' | 'tutorial' | 'video' | 'book'
  relevance: number      // 0-1
  intent: RecommendationIntent
}

export interface RecommendationOutput {
  recommendations: RecommendedResource[]
  searchKeywords: string[]
  searchIntents: Array<{ intent: RecommendationIntent; keywords: string[] }>
}

/**
 * Smart Suggestion — D9 Memory v1
 *
 * 启发式相似度评分：当用户生成新 KC 时，从 localStorage 历史中找出最相关的 KC，
 * 弹出 "Compare Now" 提示。
 *
 * 设计原则（v1）：
 * - 纯客户端，不调 LLM（v2.3 可升级为 embedding 相似度）
 * - 启发式加权评分（field/authors/key_terms/tags/year/title/summary）
 *
 * 评分规则（满分 100）：
 * - field 完全匹配：            +30
 * - authors 重叠 ≥ 1：           +25
 * - key_terms 重叠 ≥ 30%：       +25
 * - tags 重叠 ≥ 1（剔除元数据）：+15
 * - year 接近（≤ 5 年）：        +5
 * - title 显著词重叠 ≥ 1：        +10（fallback）
 * - summary 词重叠 ≥ 30%：       +10（fallback）
 *
 * 阈值：score ≥ 30 才显示建议
 *
 * 使用场景：
 * - app/page.tsx 在 result 到达后调用 computeSmartSuggestion(currentKC, history)
 * - 渲染 <SmartSuggestionBanner> 显示匹配结果
 */

import type { KnowledgeCard } from '@/types/knowledge'
import type { KCHistoryEntry } from '@/lib/kc-history'

// ============================================================================
// 类型
// ============================================================================

export interface SmartSuggestion {
  /** 最佳匹配的历史 KC entry（null 表示无匹配） */
  bestMatch: KCHistoryEntry | null
  /** 综合评分 0-100 */
  score: number
  /** 人话解释（用于 banner 显示，如 "Same field: NLP" / "Shared 4 key terms"） */
  reasons: string[]
  /** 关系类型（用于 banner 标题，如 "Related Paper" / "Same Field" / "Shared Authors"） */
  relationType: 'same_field' | 'shared_authors' | 'shared_terms' | 'related' | 'none'
}

// ============================================================================
// 主入口
// ============================================================================

const SHOW_SUGGESTION_THRESHOLD = 30

/**
 * 计算当前 KC 与历史 KC 列表的最佳匹配
 *
 * @param currentKC 当前生成的 KC
 * @param history  历史 KC 列表（已排除当前 KC）
 * @returns SmartSuggestion（bestMatch 为 null 表示无足够相似的 KC）
 *
 * @example
 * ```typescript
 * const history = loadKCHistory()
 * const suggestion = computeSmartSuggestion(currentKC, history)
 * if (suggestion.bestMatch) {
 *   // 显示 banner: "💡 与你昨天读的 'Attention Is All You Need' 同领域 (NLP)"
 * }
 * ```
 */
export function computeSmartSuggestion(
  currentKC: KnowledgeCard,
  history: KCHistoryEntry[]
): SmartSuggestion {
  if (!history || history.length === 0) {
    return { bestMatch: null, score: 0, reasons: [], relationType: 'none' }
  }

  let bestMatch: KCHistoryEntry | null = null
  let bestScore = 0
  let bestReasons: string[] = []
  let bestRelationType: SmartSuggestion['relationType'] = 'none'

  for (const entry of history) {
    const { score, reasons, relationType } = scorePair(currentKC, entry.knowledgeCard)
    if (score > bestScore) {
      bestScore = score
      bestMatch = entry
      bestReasons = reasons
      bestRelationType = relationType
    }
  }

  if (bestScore < SHOW_SUGGESTION_THRESHOLD) {
    return { bestMatch: null, score: bestScore, reasons: bestReasons, relationType: 'none' }
  }

  return {
    bestMatch,
    score: bestScore,
    reasons: bestReasons,
    relationType: bestRelationType,
  }
}

// ============================================================================
// 评分逻辑
// ============================================================================

interface PairScore {
  score: number
  reasons: string[]
  relationType: SmartSuggestion['relationType']
}

function scorePair(a: KnowledgeCard, b: KnowledgeCard): PairScore {
  let score = 0
  const reasons: string[] = []
  const signals: Array<'field' | 'authors' | 'terms' | 'tags' | 'year' | 'title' | 'summary'> = []

  // 1. Field 完全匹配（最强信号 — 同领域论文最相关）
  if (a.field && b.field && a.field.toLowerCase() === b.field.toLowerCase()) {
    score += 30
    reasons.push(`Same field: ${a.field}`)
    signals.push('field')
  }

  // 2. Authors 重叠 ≥ 1
  const sharedAuthors = computeSharedAuthors(a.authors, b.authors)
  if (sharedAuthors.length > 0) {
    score += 25
    const names = sharedAuthors.slice(0, 2).join(', ')
    reasons.push(`Shared author${sharedAuthors.length > 1 ? 's' : ''}: ${names}${sharedAuthors.length > 2 ? ' +' + (sharedAuthors.length - 2) + ' more' : ''}`)
    signals.push('authors')
  }

  // 3. Key terms 重叠 ≥ 30%（取较小集合）
  const sharedTerms = computeSharedTerms(a.key_terms, b.key_terms)
  const smallerSize = Math.min(a.key_terms?.length || 0, b.key_terms?.length || 0)
  if (smallerSize > 0) {
    const overlapRatio = sharedTerms.length / smallerSize
    if (overlapRatio >= 0.3) {
      score += 25
      const terms = sharedTerms.slice(0, 3).join(', ')
      reasons.push(`Shared ${sharedTerms.length} key terms: ${terms}${sharedTerms.length > 3 ? ' ...' : ''}`)
      signals.push('terms')
    }
  }

  // 4. Tags 重叠 ≥ 1（剔除自动生成的元数据 tag）
  const sharedTags = computeSharedTags(a.tags, b.tags)
  if (sharedTags.length > 0) {
    score += 15
    reasons.push(`Shared tags: ${sharedTags.slice(0, 3).join(', ')}`)
    signals.push('tags')
  }

  // 5. Year 接近（≤ 5 年）
  if (a.year && b.year) {
    const yearDiff = Math.abs(a.year - b.year)
    if (yearDiff <= 5) {
      score += 5
      if (yearDiff === 0) {
        reasons.push(`Same year (${a.year})`)
      } else {
        reasons.push(`${yearDiff} years apart (${Math.min(a.year, b.year)}–${Math.max(a.year, b.year)})`)
      }
      signals.push('year')
    }
  }

  // 6. Fallback：Title 显著词直接重叠 ≥ 1（当 field/authors/terms 都未匹配时启用）
  //    例：A="Attention Is All You Need" / B="...Transformers"
  //    通过 light stem 匹配 "transformer" ↔ "transformers"
  const sharedTitleWords = computeSharedTitleWords(a.title, b.title)
  if (sharedTitleWords.length > 0) {
    score += 10
    reasons.push(`Shared title word: ${sharedTitleWords.slice(0, 2).join(', ')}`)
    signals.push('title')
  }

  // 6b. Cross-match：A 的 title 显著词出现在 B 的 summary 中（或反之）
  //     用于 LLM 漏抽 field 但 summary 含相关主题词时识别关联
  //     比纯 title 重叠更强（A 的标题词出现在 B 的正文里，是真实的主题关联）
  const crossTitleSummaryWords = computeCrossTitleSummaryMatch(a, b)
  if (crossTitleSummaryWords.length > 0) {
    score += 15
    reasons.push(`Topic in other paper: ${crossTitleSummaryWords.slice(0, 2).join(', ')}`)
    signals.push('title')
  }

  // 6c. Cross-match：A.key_terms 词出现在 B.title 或 B.summary 中（或反之）
  //     最强 fallback 信号 — key_terms 是 LLM 验证的重要概念，
  //     出现在另一篇的标题/摘要中说明主题强相关
  //     例：A.key_terms=["Transformer"] / B.title="BERT: ...Transformers"
  const crossKeyTermWords = computeKeyTermsCrossMatch(a, b)
  if (crossKeyTermWords.length > 0) {
    score += 15
    reasons.push(`Key term in other paper: ${crossKeyTermWords.slice(0, 2).join(', ')}`)
    signals.push('terms')
  }

  // 7. Fallback：Summary 词重叠 ≥ 30%
  //    当 LLM 漏抽 field 时，summary 词重叠仍能识别相关论文
  const summaryOverlap = computeSummaryOverlap(a.summary, b.summary)
  if (summaryOverlap.ratio >= 0.3 && summaryOverlap.shared.length >= 3) {
    score += 10
    reasons.push(`Similar summaries (${Math.round(summaryOverlap.ratio * 100)}% word overlap)`)
    signals.push('summary')
  }

  // 决定 relationType（按信号强度优先级）
  const relationType: SmartSuggestion['relationType'] = (() => {
    if (signals.includes('authors')) return 'shared_authors'
    if (signals.includes('terms')) return 'shared_terms'
    if (signals.includes('field')) return 'same_field'
    if (signals.includes('title') || signals.includes('summary')) return 'related'
    if (signals.length > 0) return 'related'
    return 'none'
  })()

  return { score: Math.min(100, score), reasons, relationType }
}

// ============================================================================
// 辅助：计算各类重叠
// ============================================================================

/**
 * 作者重叠 — 姓氏匹配（避免 "John Smith" vs "J. Smith" 漏配）
 */
function computeSharedAuthors(a?: string[], b?: string[]): string[] {
  if (!a || !b || a.length === 0 || b.length === 0) return []

  const normalize = (name: string): string => {
    // "John Smith" → "smith"；"J. Smith" → "smith"；"Smith, John" → "smith"
    const cleaned = name.toLowerCase().replace(/[^a-z\s,]/g, '').trim()
    if (!cleaned) return ''
    // 取最后一段（姓）
    const parts = cleaned.split(/[\s,]+/).filter(p => p.length > 1)
    return parts[parts.length - 1] || cleaned
  }

  const setA = new Set(a.map(normalize).filter(n => n.length > 1))
  const setB = new Set(b.map(normalize).filter(n => n.length > 1))

  const shared: string[] = []
  for (const aName of a) {
    const na = normalize(aName)
    if (na.length <= 1) continue
    if (setB.has(na) && !shared.some(s => normalize(s) === na)) {
      // 用 a 的原始格式（完整作者名）
      shared.push(aName)
    }
  }
  return shared
}

/**
 * Key terms 重叠 — term 字符串匹配（忽略大小写、忽略短词如 "the" / "a"）
 */
function computeSharedTerms(
  a?: Array<{ term: string }>,
  b?: Array<{ term: string }>
): string[] {
  if (!a || !b || a.length === 0 || b.length === 0) return []

  const setB = new Set(b.map(t => normalizeTerm(t.term)))
  const shared: string[] = []
  const seen = new Set<string>()

  for (const t of a) {
    const nt = normalizeTerm(t.term)
    if (nt.length <= 1 || STOP_WORDS.has(nt)) continue
    if (setB.has(nt) && !seen.has(nt)) {
      shared.push(t.term) // 用 a 的原始格式
      seen.add(nt)
    }
  }
  return shared
}

/**
 * Tags 重叠 — 完全匹配（忽略大小写），剔除自动生成的元数据 tag
 */
function computeSharedTags(a?: string[], b?: string[]): string[] {
  if (!a || !b || a.length === 0 || b.length === 0) return []
  const filteredA = a.filter(t => !isMetadataTag(t))
  const filteredB = b.filter(t => !isMetadataTag(t))
  if (filteredA.length === 0 || filteredB.length === 0) return []
  const setB = new Set(filteredB.map(t => t.toLowerCase().trim()))
  return filteredA.filter(t => setB.has(t.toLowerCase().trim()))
}

/**
 * 判断是否为 LLM 自动生成的元数据 tag（非学科/主题 tag）
 *
 * 实测发现 LLM 生成的 KC tags 经常包含 "researchkit"、"terms"、"structured" 这类
 * 自动元数据 tag，并不反映论文主题，需剔除避免误判为相似。
 */
function isMetadataTag(tag: string): boolean {
  const t = tag.toLowerCase().trim()
  return METADATA_TAGS.has(t)
}

const METADATA_TAGS = new Set([
  'researchkit', 'terms', 'structured', 'knowledge-card', 'card',
  'auto-generated', 'generated',
])

/**
 * Title 显著词重叠（fallback 信号）
 *
 * - 把 title 拆词，剔除停用词和过短的词
 * - 取同时出现在两个 title 中的显著词（light stemming 处理 "transformer" ↔ "transformers"）
 * - 例：A="Attention Is All You Need" / B="...Transformers" → 共享 "transformers" 词干
 */
function computeSharedTitleWords(a?: string, b?: string): string[] {
  if (!a || !b) return []
  const wordsA = extractSignificantWords(a)
  const wordsB = extractSignificantWords(b)
  const shared: string[] = []
  const seen = new Set<string>()
  for (const w of wordsA) {
    const stem = lightStem(w)
    if (seen.has(stem)) continue
    if (wordsB.includes(w) || wordsB.some(wb => lightStem(wb) === stem)) {
      shared.push(w)
      seen.add(stem)
    }
  }
  return shared
}

/**
 * Cross-match：A 的 title 显著词出现在 B 的 summary 中（或反之）
 *
 * 用于 LLM 漏抽 field 但 summary 含相关主题词时识别关联
 * 例：A.title="Attention Is All You Need"（A.summary 含 "Transformer"）
 *     B.title="BERT: ...Transformers" → 通过 stem 后 "transformer" 匹配
 */
function computeCrossTitleSummaryMatch(a: KnowledgeCard, b: KnowledgeCard): string[] {
  const aTitleWords = extractSignificantWords(a.title || '')
  const bSummaryWords = extractSignificantWords(b.summary || '')
  const bTitleWords = extractSignificantWords(b.title || '')
  const aSummaryWords = extractSignificantWords(a.summary || '')

  const shared: string[] = []
  const seen = new Set<string>()

  // 方向 1：A.title 词出现在 B.summary 中
  for (const w of aTitleWords) {
    const stem = lightStem(w)
    if (seen.has(stem)) continue
    if (bSummaryWords.includes(w) || bSummaryWords.some(sw => lightStem(sw) === stem)) {
      shared.push(w)
      seen.add(stem)
    }
  }

  // 方向 2：B.title 词出现在 A.summary 中
  for (const w of bTitleWords) {
    const stem = lightStem(w)
    if (seen.has(stem)) continue
    if (aSummaryWords.includes(w) || aSummaryWords.some(sw => lightStem(sw) === stem)) {
      shared.push(w)
      seen.add(stem)
    }
  }

  return shared.slice(0, 5)
}

/**
 * Cross-match：A.key_terms 词出现在 B.title 或 B.summary 中（或反之）
 *
 * 最强 fallback 信号 — key_terms 是 LLM 验证的重要概念，
 * 出现在另一篇的标题/摘要中说明主题强相关
 * 例：A.key_terms=["Transformer"] / B.title="BERT: ...Transformers"
 */
function computeKeyTermsCrossMatch(a: KnowledgeCard, b: KnowledgeCard): string[] {
  const aKeyTermWords = extractSignificantWords((a.key_terms || []).map(t => t.term).join(' '))
  const bTitleSummaryWords = [
    ...extractSignificantWords(b.title || ''),
    ...extractSignificantWords(b.summary || ''),
  ]
  const bKeyTermWords = extractSignificantWords((b.key_terms || []).map(t => t.term).join(' '))
  const aTitleSummaryWords = [
    ...extractSignificantWords(a.title || ''),
    ...extractSignificantWords(a.summary || ''),
  ]

  const shared: string[] = []
  const seen = new Set<string>()

  // 方向 1：A.key_terms 词出现在 B.title/summary 中
  for (const w of aKeyTermWords) {
    const stem = lightStem(w)
    if (seen.has(stem)) continue
    if (bTitleSummaryWords.includes(w) || bTitleSummaryWords.some(sw => lightStem(sw) === stem)) {
      shared.push(w)
      seen.add(stem)
    }
  }

  // 方向 2：B.key_terms 词出现在 A.title/summary 中
  for (const w of bKeyTermWords) {
    const stem = lightStem(w)
    if (seen.has(stem)) continue
    if (aTitleSummaryWords.includes(w) || aTitleSummaryWords.some(sw => lightStem(sw) === stem)) {
      shared.push(w)
      seen.add(stem)
    }
  }

  return shared.slice(0, 5)
}

/**
 * Light stemming — 处理常见英文复数和所有格后缀
 *
 * 用于 cross-match：transformer ↔ transformers ↔ transformer's
 * 不做完整 Porter Stemmer（避免过度归一化导致误匹配）
 */
function lightStem(word: string): string {
  let w = word.toLowerCase()
  // 处理所有格
  if (w.endsWith("'s")) w = w.slice(0, -2)
  // 处理复数（按长度倒序避免 'es' 先匹配 's'）
  if (w.endsWith('ies') && w.length > 4) w = w.slice(0, -3) + 'y'  // studies → study
  else if (w.endsWith('es') && w.length > 3) w = w.slice(0, -2)     // boxes → box
  else if (w.endsWith('s') && w.length > 3) w = w.slice(0, -1)      // transformers → transformer
  return w
}

/**
 * Summary 词重叠比例（fallback 信号）
 *
 * - 提取显著词（剔除停用词）
 * - 计算较小集合的重叠比例
 * - 用于 LLM 漏抽 field 时识别相关论文
 */
function computeSummaryOverlap(a?: string, b?: string): { ratio: number; shared: string[] } {
  if (!a || !b) return { ratio: 0, shared: [] }
  const wordsA = extractSignificantWords(a)
  const wordsB = extractSignificantWords(b)
  if (wordsA.length === 0 || wordsB.length === 0) return { ratio: 0, shared: [] }
  const setB = new Set(wordsB)
  const uniqueA = Array.from(new Set(wordsA))
  const shared: string[] = []
  for (const w of uniqueA) {
    if (setB.has(w) && !shared.includes(w)) shared.push(w)
  }
  const smallerSize = Math.min(uniqueA.length, setB.size)
  return { ratio: shared.length / smallerSize, shared }
}

/**
 * 从字符串提取显著词（剔除停用词、剔除长度 ≤ 3 的短词、剔除数字）
 */
function extractSignificantWords(text: string): string[] {
  // 拆词：按非字母字符分割
  const words = text.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3)
  // 剔除停用词
  return words.filter(w => !STOP_WORDS.has(w))
}

function normalizeTerm(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim()
}

/** 启用停用词过滤 — 避免把 "the" / "model" / "learning" 这类通用词算作强信号 */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'for', 'to', 'with',
  'model', 'learning', 'method', 'paper', 'result', 'approach',
  'system', 'data', 'study', 'research', 'analysis', 'based',
  'self', 'this', 'that', 'these', 'those', 'from', 'into', 'such',
  'their', 'them', 'they', 'were', 'been', 'have', 'has', 'will',
])

// ============================================================================
// UI 辅助：生成 banner 文案
// ============================================================================

/**
 * 生成 banner 标题文案
 *
 * @example
 * - "Same field: NLP"
 * - "Shared 2 authors"
 * - "Related: shares 5 key terms"
 */
export function getSuggestionTitle(suggestion: SmartSuggestion): string {
  const { relationType, reasons, bestMatch } = suggestion
  if (!bestMatch) return ''

  // 取第一个 reason 作为主标题（最强的信号）
  const mainReason = reasons[0] || 'Related paper'

  switch (relationType) {
    case 'same_field':
      return mainReason
    case 'shared_authors':
      return mainReason
    case 'shared_terms':
      return mainReason
    case 'related':
      return mainReason
    default:
      return 'Related paper'
  }
}

/**
 * 生成关系图标（用于 banner 显示）
 */
export function getSuggestionIcon(relationType: SmartSuggestion['relationType']): string {
  switch (relationType) {
    case 'same_field': return '🎯'
    case 'shared_authors': return '👥'
    case 'shared_terms': return '🔗'
    case 'related': return '💡'
    default: return '💡'
  }
}

/**
 * Compare Papers 类型定义 — D8
 *
 * 输入：两个 KnowledgeCard
 * 输出：6 维对比 + 综合差异度评分
 *
 * 6 个维度（与 KnowledgeCard 字段对应）：
 * 1. field          — 学科领域
 * 2. methodology    — 研究方法
 * 3. key_contributions — 核心贡献（基于 innovation + research_goals）
 * 4. strengths      — 优势（基于 results + applications）
 * 5. limitations    — 局限性
 * 6. complexity     — 复杂度（基于 difficulty + 结构）
 *
 * 每维返回：
 * - valueA / valueB：两篇在该维度的简短描述（≤ 100 字符）
 * - scoreA / scoreB：0-100 评分（用于雷达图）
 * - diff：差异说明（一句话，如"A 用 CNN，B 用 Transformer"）
 *
 * overallScore：0-100 综合差异度（0=完全相同，100=完全不同）
 */

export interface CompareDimension {
  /** 维度名（snake_case，对应 KnowledgeCard 字段） */
  name: string
  /** 维度显示名（如 "Research Methodology"） */
  label: string
  /** A 篇在该维度的简短描述（≤ 100 字符） */
  valueA: string
  /** B 篇在该维度的简短描述（≤ 100 字符） */
  valueB: string
  /** A 篇评分 0-100（雷达图用） */
  scoreA: number
  /** B 篇评分 0-100 */
  scoreB: number
  /** 差异说明（一句话，如 "A 用 CNN，B 用 Transformer"） */
  diff: string
}

export interface CompareResult {
  /** 6 维对比详情 */
  dimensions: CompareDimension[]
  /** 综合差异度 0-100（0=完全相同，100=完全不同） */
  overallScore: number
  /** 整体对比摘要（2-3 句话，评委演示时高亮） */
  summary: string
  /** 推荐阅读顺序（"A_before_B" / "B_before_A" / "parallel"） */
  recommendedOrder: 'A_before_B' | 'B_before_A' | 'parallel'
  /** 推荐阅读顺序的理由 */
  orderReason: string
  /** LLM 实际使用的模型名 */
  model?: string
  /** 调用耗时（毫秒） */
  durationMs?: number
}

export const COMPARE_DIMENSIONS = [
  'field',
  'methodology',
  'key_contributions',
  'strengths',
  'limitations',
  'complexity',
] as const

export type CompareDimensionName = (typeof COMPARE_DIMENSIONS)[number]

export const COMPARE_DIMENSION_LABELS: Record<CompareDimensionName, string> = {
  field: 'Research Field',
  methodology: 'Methodology',
  key_contributions: 'Key Contributions',
  strengths: 'Strengths',
  limitations: 'Limitations',
  complexity: 'Complexity',
}

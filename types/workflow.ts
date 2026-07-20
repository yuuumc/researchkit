/**
 * Workflow 类型定义
 *
 * v2.0 重构 — Plan / PlanStep / Reflection / Replan 的单一可信源
 * 当前 lib/planner.ts 仍 re-export 这些类型以保持向后兼容
 */

import type { AnalyzerField } from './agent'
import type { KnowledgeCard } from './knowledge'

// ============================================================================
// Plan
// ============================================================================

export interface PlanStep {
  id: string
  agent: string            // 'Reader' | 'Analyzer' | ...
  reason: string
  parallel_group: number
  depends_on: string[]
  required: boolean
}

export interface PlannedToolCall {
  id: string
  tool: string
  reason: string
  input: Record<string, any>
  run_after: string
}

export interface Plan {
  rationale: string
  input_type: 'paper' | 'documentation' | 'url' | 'general_text' | 'unknown'
  complexity: 'low' | 'medium' | 'high'
  estimated_steps: number
  steps: PlanStep[]
  tool_calls: PlannedToolCall[]
  required_schema: AnalyzerField[]
}

export interface PlannerOutput {
  plan: Plan
}

// ============================================================================
// Reflection
// ============================================================================

export interface ReflectionReview {
  student_useful: boolean       // 学生能用吗
  researcher_trust: boolean     // 研究者会信吗
  has_confusion: boolean        // 有混淆点吗
  confusion_points: string[]
}

export interface ReflectionResult {
  satisfied: boolean
  missing: string[]                    // 缺失的字段
  reasoning: string
  additional_steps: PlanStep[]
  review: ReflectionReview
}

// ============================================================================
// Replan
// ============================================================================

export interface ReplanResult {
  should_continue: boolean
  reasoning: string
  supplementary_steps: PlanStep[]
  adjust_prompt_for: string[]
  prompt_patches: Record<string, {
    focus_fields: string[]
    ignore_fields: string[]
    extra_instruction: string
  }>
}

// ============================================================================
// Execution trace
// ============================================================================

export interface ExecutedStep {
  step: PlanStep
  success: boolean
  durationMs: number
  output?: any
  error?: string
}

/**
 * 反思循环的迭代 trace — 评委可视化用
 */
export interface ReflectionIteration {
  iteration: number
  reflection: ReflectionResult
  replan?: ReplanResult
  supplementary_execution?: ExecutedStep[]
  supplementary_duration_ms?: number
  replan_duration_ms?: number
  reflection_duration_ms: number
}

// ============================================================================
// Coordinator I/O
// ============================================================================

export type CoordinatorStage =
  | { id: 1; label: 'Document Loaded'; detail?: string }
  | { id: 2; label: 'Plan Generated'; detail?: string }
  | { id: 3; label: 'Concepts Extracted'; detail?: string }
  | { id: 4; label: 'Knowledge Card Built'; detail?: string }
  | { id: 5; label: 'Reflection Loop'; detail?: string }
  | { id: 6; label: 'Exports Ready'; detail?: string }
  | { id: 7; label: 'Done'; detail?: string }

export interface CoordinatorInput {
  content: string
  title?: string
  source?: string
  language?: 'zh' | 'en'
  onStage?: (stage: CoordinatorStage) => void
}

export interface CoordinatorOutput {
  plan: Plan
  plannerDurationMs: number
  knowledgeCard: KnowledgeCard
  recommendations: import('./knowledge').RecommendationOutput
  exports: import('./export').ExportOutput
  execution: ExecutedStep[]
  reflection: ReflectionResult
  reflectionDurationMs: number
  iterations: ReflectionIteration[]
  totalIterations: number
  toolCalls: import('@/lib/tools/types').ToolCall[]
  toolCallDurationMs: number
  pipeline: Array<{
    agent: string
    durationMs: number
    success: boolean
  }>
  totalDurationMs: number
}

/**
 * ResearchKit 类型层统一入口
 *
 * v2.0 重构 — 所有跨模块类型从此处 re-export
 *
 * 用法：
 *   import type { KnowledgeCard, AgentContext, Plan } from '@/types'
 *
 * 而不是从分散的 agent 文件 import：
 *   import type { KnowledgeCard } from '@/lib/agents/knowledge-builder'  // ❌ 旧路径
 *
 * 注意：AnalyzerField 在 agent.ts 和 knowledge.ts 都定义了（前者是 Agent 决策用，
 * 后者是常量数组导出）。这里以 knowledge.ts 为准（包含 ANALYZER_FIELDS 常量）。
 */

export type {
  AgentInterface,
  AgentContext,
  AgentResult,
  AgentTrace,
} from './agent'

export {
  ANALYZER_FIELDS,
  DEFAULT_SCHEMA_BY_INPUT_TYPE,
} from './knowledge'

export type {
  AnalyzerField,
  ReaderOutput,
  AnalyzerOutput,
  TerminologyTerm,
  TerminologyOutput,
  KnowledgeCard,
  KnowledgeCardEvaluation,
  RecommendationIntent,
  RecommendedResource,
  RecommendationOutput,
} from './knowledge'

export type {
  PlanStep,
  PlannedToolCall,
  Plan,
  PlannerOutput,
  ReflectionReview,
  ReflectionResult,
  ReplanResult,
  ExecutedStep,
  ReflectionIteration,
  CoordinatorStage,
  CoordinatorInput,
  CoordinatorOutput,
} from './workflow'

export type {
  ExportOutput,
  ExportAgentInput,
} from './export'

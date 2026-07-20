/**
 * Agent 类型定义
 *
 * v2.0 重构 — 统一 Agent Interface
 *
 * 设计目标：
 * - 所有 Agent 共享同一 interface（新增 agent 不用改 coordinator）
 * - 统一 AgentContext（未来加 Memory / UserPref 不用改接口）
 * - 兼容现有 mcp.ts 的 Agent 接口（handleMessage 风格）
 */

import type { AgentMessage, AgentCapability } from '@/lib/mcp'
import type { Locale } from '@/lib/locale'
import type {
  ReaderOutput,
  AnalyzerOutput,
  TerminologyOutput,
  KnowledgeCard,
  AnalyzerField,
} from './knowledge'
import type { RecommendationOutput } from './knowledge'

/**
 * Agent 接口 — 所有 Agent 必须实现
 *
 * v2.0 升级：统一 `execute(ctx)` 接口
 * - v1.0 通过 handleMessage(message: AgentMessage) 调用 — 仍保留以兼容
 * - v2.0 新增 execute(ctx: AgentContext) — executor 走这条路径
 * - execute 内部构造 AgentMessage 调 handleMessage（迁移期），v2.1 起 handleMessage 可废弃
 *
 * 新增 Critic Agent 只需 `class CriticAgent implements AgentInterface`
 */
export interface AgentInterface {
  /** Agent 名称（用于调度，如 'Reader' / 'Analyzer'） */
  name: string
  /** Agent 描述（Planner 决策时用） */
  description: string
  /** Agent 能力清单（Planner 可读） */
  capabilities: AgentCapability[]

  /**
   * v2.0 统一执行入口 — 接收 AgentContext，返回 AgentResult
   *
   * executor 改为 `agents[step.agent].execute(ctx)`，
   * 未来新增 Agent 不用改 executor，只需注册到 AGENTS 表
   */
  execute(ctx: AgentContext): Promise<AgentResult>

  /**
   * v1.0 兼容接口 — 处理 AgentMessage
   * @deprecated v2.0 后期废弃，统一走 execute(ctx)
   */
  handleMessage(message: AgentMessage): Promise<AgentMessage>

  /** 查询能力 */
  getCapabilities(): AgentCapability[]
}

/**
 * 统一 Agent 上下文 — 所有 Agent 共享的输入
 *
 * v2.0 重构：executor 通过 buildAgentContext 构造此对象，
 * 所有 Agent 的 execute(ctx) 接收同一份 ctx，按需取用。
 *
 * 设计原则：
 * - document: 输入文档（content + 检测的 locale + 元数据）
 * - workflow: 当前 plan 的上下文（input_type + 需要的 schema 字段 + plan）
 * - previous: 前序 Agent 的输出（Reader/Analyzer/Terminology/KB/Recommendation）
 * - options: 用户级选项（locale / sourceLocale / languageDirective / detailLevel）
 */
export interface AgentContext {
  /** 输入文档 */
  document: {
    content: string
    language: 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es' | 'other'
    locale: Locale
    /** 可选标题（用户提供或 URL 抓取时提取） */
    title?: string
    /** 来源 URL 或文件名 */
    source?: string
    /** 文档元数据（如 PDF 解析的页数、URL 抓取的 favicon 等） */
    metadata?: Record<string, unknown>
  }

  /** 当前 plan 的上下文 */
  workflow: {
    /** Planner 判定的输入类型 */
    inputType: 'paper' | 'documentation' | 'url' | 'general_text' | 'unknown'
    /** Planner 决定 Analyzer 提取的字段（动态 schema） */
    requiredSchema: AnalyzerField[]
    /** Planner 判定的复杂度 */
    complexity: 'low' | 'medium' | 'high'
    /** 完整 Plan（Export 用 source / tool_calls 等） */
    plan?: import('./workflow').Plan
  }

  /** 前序 Agent 的输出（按依赖顺序填充） */
  previous: {
    reader?: ReaderOutput
    analyzer?: AnalyzerOutput
    terminology?: TerminologyOutput
    knowledgeCard?: KnowledgeCard
    /** Recommendation 输出（Export 用） */
    recommendation?: RecommendationOutput
  }

  /** 用户选项 */
  options: {
    /** 目标 locale（输出语言） */
    locale: Locale
    /** 源 locale（输入语言，用于避免翻译） */
    sourceLocale: Locale
    /** 语言指令字符串（coordinator 入口算好，所有 Agent 共享） */
    languageDirective: string
    /** 详细级别：'standard' | 'detailed' */
    detailLevel?: 'standard' | 'detailed'
  }

  /** Prompt 补丁（Replan 阶段为缺失字段定制提示） */
  promptPatch?: {
    focus_fields: string[]
    ignore_fields: string[]
    extra_instruction: string
  }
}

/**
 * Analyzer 可提取的字段清单
 * Planner 根据 input_type 决定子集
 *
 * 注意：常量数组 ANALYZER_FIELDS 在 ./knowledge.ts 中定义
 * 这里仅 re-export 类型，避免重复
 */
// AnalyzerField 已从 ./knowledge 导入并直接使用
export type { AnalyzerField } from './knowledge'

/**
 * Agent 执行结果（统一返回结构）
 *
 * data 类型默认为 any — 每个 Agent 返回不同结构，由调用方按需断言
 * （Reader 返回 ReaderOutput，Analyzer 返回 AnalyzerOutput，等等）
 */
export interface AgentResult<T = any> {
  success: boolean
  data: T
  durationMs: number
  error?: string
}

/**
 * Agent 执行 trace — UI Timeline 用
 */
export interface AgentTrace {
  agent: string
  status: 'idle' | 'running' | 'completed' | 'failed'
  durationMs: number
  /** 触发的并行组（同组并行，跨组串行） */
  parallelGroup?: number
  /** 是否为补调步骤（Reflection 后触发） */
  isSupplementary?: boolean
  error?: string
}

/**
 * PromptBuilder 类型 — 三层架构
 *
 * 设计：
 * - System prompt 🔒 ResearchKit 内置（只读，不可被覆盖）
 *   每个 Agent 的核心指令（如 Reader 的 takeaway 提取规则）
 * - Project extension ➕ 项目级扩展（用户在 Settings 保存）
 *   团队/个人通用规则（如"输出论文时引用 GB/T 7714 格式"）
 * - User extension ➕ 单次扩展（一次 LLM 调用前传入）
 *   本次任务的特殊要求（如"这篇论文是综述，重点抓分类体系"）
 *
 * 拼接顺序（最终 system message）：
 * ```
 * {system}
 *
 * --- Project Extension ---
 * {project}
 *
 * --- User Extension ---
 * {user}
 * ```
 *
 * 安全保障：
 * - System 永远在最前（LLM 优先遵守）
 * - Project / User 不能覆盖 System（最多追加规则）
 * - 拼接长度超限时优先丢弃 User，再丢弃 Project（System 永远保留）
 */

/**
 * Agent 标识 — 用于查找对应的 System prompt 和 Project extension
 *
 * 与 Agent name 对齐（coordinator 注册的 agent 名）
 */
export type AgentName =
  | 'Reader'
  | 'Analyzer'
  | 'Terminology'
  | 'Recommendation'
  | 'KnowledgeBuilder'
  | 'Planner'
  | 'Reflection'
  | 'Replan'
  // D30 — Smart Suggestion v2 也走 PromptBuilder（让 LLM 判断相关论文）
  | 'SmartSuggestion'

/**
 * Project Extension — 项目级 prompt 扩展
 *
 * 用户在 Settings → Prompt Tab 保存
 * 每个 Agent 一条，存到 localStorage + cookie
 *
 * 字段：
 * - appendInstructions：附加在 System prompt 末尾的规则（不替换）
 * - outputPreferences：通用输出偏好（如"使用被动语态"、"避免第一人称"）
 *   这些会被注入到所有 Agent 的 prompt 末尾
 */
export interface ProjectExtension {
  /** 附加规则（追加在 System prompt 末尾） */
  appendInstructions?: string
  /** 输出偏好（影响所有 Agent） */
  outputPreferences?: string
  /** 最后更新时间（毫秒） */
  updatedAt?: number
}

/**
 * User Extension — 单次扩展（不持久化）
 *
 * Agent 在调用 LLM 前临时构造
 * 例如：Planner 的 Replan 阶段可以注入"上次 Iteration 缺什么字段"
 */
export interface UserExtension {
  /** 单次附加指令 */
  appendInstructions?: string
  /** 单次输出偏好（覆盖 Project 的 outputPreferences） */
  outputPreferences?: string
}

/**
 * 完整 Prompt 输入 — PromptBuilder.build() 入参
 */
export interface PromptBuildInput {
  /** Agent 名（用于查 System prompt） */
  agent: AgentName
  /** 🔒 System prompt（必传，从 prompts/xxx.ts 来） */
  system: string
  /** ➕ Project 扩展（可选，从 Settings 来） */
  project?: ProjectExtension | null
  /** ➕ User 扩展（可选，本次调用临时传入） */
  user?: UserExtension | null
  /**
   * 🎭 角色 preset（D5 接入）
   * - 'academic' 默认学术风格
   * - 'beginner' 入门解释
   * - 'developer' 实战工程师视角
   * - 'researcher' 资深研究员视角
   * - 'product_manager' 产品经理视角
   *
   * D4 阶段只占位，D5 在 presets.ts 实现
   */
  preset?: string
}

/**
 * 最终拼接好的 system message
 */
export interface BuiltPrompt {
  /** 最终 system message 内容（直接传给 LLM） */
  content: string
  /** 调试信息 — 哪些层被拼接进来了 */
  layers: {
    system: true
    project: boolean
    user: boolean
    preset: boolean
  }
  /** 估算字符数（用于排查超限） */
  charCount: number
}

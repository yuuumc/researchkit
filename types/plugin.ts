/**
 * Plugin System 类型定义 — D12
 *
 * 设计目标：
 * - 让 Knowledge Card 可以导出到任意第三方工具（Notion / Obsidian / 飞书 / IPFS / Onchain）
 * - 插件可热插拔：注册 + 启用/禁用 + 调用
 * - v2.2 起步：定义接口 + 注册表 + 2 个示例插件（JSON 下载 / Markdown 下载）
 * - v2.3 扩展：Onchain Export Plugin（D13）+ Notion / Obsidian Publish
 *
 * 三层架构：
 *   ┌────────────────────────────────────────────┐
 *   │  UI: PluginPanel — 展示已注册插件，触发 export │
 *   ├────────────────────────────────────────────┤
 *   │  Registry: pluginRegistry — 单例，注册/查询     │
 *   ├────────────────────────────────────────────┤
 *   │  Plugins: 各插件实现 ExportPlugin 接口          │
 *   └────────────────────────────────────────────┘
 *
 * 插件能力：
 * - export(kc, options) — 主入口，返回 ExportResult
 * - getCapabilities() — 描述插件能力（UI 用）
 * - validate?(kc) — 可选，预校验 KC 是否满足插件要求（如必须有 authors）
 */

import type { KnowledgeCard } from './knowledge'

// ============================================================================
// 插件接口
// ============================================================================

/**
 * 插件能力描述（UI 用）
 */
export interface PluginCapability {
  /** 插件支持的动作类型 */
  type: 'download' | 'publish' | 'sync' | 'notify'
  /** 输出格式 */
  format: 'json' | 'markdown' | 'html' | 'binary' | 'custom'
  /** 是否需要用户配置（如 API key / token） */
  requiresConfig: boolean
  /** 描述 */
  description: string
}

/**
 * 插件元数据
 */
export interface PluginMeta {
  /** 插件 ID（唯一，如 'json-download' / 'onchain-export'） */
  id: string
  /** 显示名（中文） */
  name: string
  /** 显示描述（1 句话） */
  description: string
  /** 版本号 */
  version: string
  /** 作者 */
  author: string
  /** emoji 图标 */
  icon: string
  /** 主题色 */
  color: string
  /** 标签（如 'official' / 'community' / 'experimental'） */
  tags: string[]
  /** 是否需要用户配置 */
  requiresConfig: boolean
  /** 配置 schema（如果 requiresConfig=true，UI 用此 schema 渲染配置表单） */
  configSchema?: PluginConfigField[]
  /** 主页 URL（可选，社区插件用） */
  homepage?: string
}

/**
 * 配置字段定义 — UI 用此 schema 渲染配置表单
 */
export interface PluginConfigField {
  /** 字段 key */
  key: string
  /** 显示标签 */
  label: string
  /** 字段类型 */
  type: 'text' | 'password' | 'url' | 'select' | 'boolean'
  /** 占位符 */
  placeholder?: string
  /** 是否必填 */
  required: boolean
  /** 默认值 */
  defaultValue?: string | boolean
  /** select 类型的选项 */
  options?: Array<{ label: string; value: string }>
  /** 帮助文本 */
  helpText?: string
}

/**
 * 插件配置（key → value）
 */
export type PluginConfig = Record<string, string | boolean>

/**
 * 插件执行上下文
 */
export interface PluginContext {
  /** 当前 Knowledge Card */
  knowledgeCard: KnowledgeCard
  /** 用户配置（来自 localStorage） */
  config: PluginConfig
  /** 触发动作（'export' / 'publish' 等） */
  action: string
}

/**
 * 插件执行结果
 */
export interface ExportResult {
  /** 是否成功 */
  success: boolean
  /** 成功时的下载内容（download 类型）或确认消息（publish 类型） */
  data?: string | Uint8Array
  /** 文件名（download 类型用） */
  filename?: string
  /** MIME 类型（download 类型用） */
  mimeType?: string
  /** 用户可见的消息（成功/失败提示） */
  message: string
  /** 返回的 URL（publish 类型用，如已发布的页面 URL） */
  url?: string
  /** 错误信息（success=false 时） */
  error?: string
  /** 耗时（ms） */
  durationMs?: number
}

/**
 * 插件接口 — 所有插件必须实现
 *
 * 设计原则：
 * - validate() 可选，用于在 UI 上预校验 KC 是否满足插件要求
 * - export() 是主入口，执行实际导出动作
 * - 插件应当是幂等的（同一 KC + config 多次调用应得到相同结果）
 * - 插件不应有副作用（除了 publish 类型会修改外部状态）
 */
export interface ExportPlugin {
  /** 插件元数据 */
  meta: PluginMeta

  /** 能力清单（描述插件能做什么） */
  capabilities: PluginCapability[]

  /**
   * 预校验 — 检查 KC 是否满足插件要求
   * 返回 null = 通过；返回字符串 = 错误原因（UI 显示）
   */
  validate?(kc: KnowledgeCard): string | null

  /**
   * 主执行入口
   *
   * 实现注意：
   * - 必须捕获所有异常并返回 success=false（不能 throw 出去）
   * - 返回的 data 应当是已编码好的（如 JSON 字符串 / Markdown 字符串）
   * - publish 类型插件必须返回 url（用户可点击访问）
   */
  export(ctx: PluginContext): Promise<ExportResult>
}

// ============================================================================
// 插件状态（运行时持久化到 localStorage）
// ============================================================================

/**
 * 插件运行时状态（每个插件一条）
 */
export interface PluginState {
  /** 插件 ID */
  pluginId: string
  /** 是否启用 */
  enabled: boolean
  /** 用户配置 */
  config: PluginConfig
  /** 最后一次执行时间戳 */
  lastExecutedAt?: number
  /** 最后一次执行结果 */
  lastResult?: {
    success: boolean
    message: string
    url?: string
  }
}

/**
 * 所有插件状态（localStorage key: 'researchkit:plugin-states'）
 */
export type PluginStates = Record<string, PluginState>

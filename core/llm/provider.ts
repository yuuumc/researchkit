/**
 * LLM Provider 抽象层
 *
 * v2.1 Stage 1 — D1 任务
 *
 * 设计目标：
 * - 把 LLM 调用从 Agent / lib/llm.ts 中剥离，统一走 Provider 接口
 * - 用户在 Settings 页可切换 Provider（DeepSeek / OpenAI / OpenRouter / Groq / Custom）
 * - 不绑定任何 LLM 厂商，新增 Provider 只需实现接口 + 注册到工厂
 *
 * 三阶段实施：
 * - D1（本文件）：只定义 interface + 类型 + ProviderFactory 骨架 + 预设
 * - D2：实现 OpenAICompatProvider（覆盖 90% 国产/海外平台）
 * - D3：lib/llm.ts 内部改用 ProviderFactory.fromEnv()，Settings UI 接入
 *
 * 不动现有代码：
 * - lib/llm.ts 的 generateKnowledgeCard 仍可直接用 openai client
 * - 所有 Agent 的 openai.chat.completions.create 暂不改
 * - D2/D3 才迁移到统一 Provider 调用
 *
 * 未来扩展（v2.3+）：
 * - Streaming（stream: true）
 * - Tool use / Function calling
 * - Retry / Cache / Rate Limit
 * - 不同 Agent 用不同 Provider（Reader 用便宜模型，Analyzer 用 Claude）
 */

// ============================================================================
// 基础类型 — Chat 调用统一接口
// ============================================================================

/**
 * 聊天消息（OpenAI 标准格式）
 *
 * 所有 Provider 都接受此格式（OpenAI / DeepSeek / OpenRouter / Groq / 火山 / 百炼 等）
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * 聊天调用选项
 *
 * 所有字段可选，不传则用 Provider 默认值
 */
export interface ChatOptions {
  /** 温度（0-2），默认 0.3 — 低温度保证 Agent 输出稳定 */
  temperature?: number

  /** 最大输出 token 数，默认不限制 */
  maxTokens?: number

  /**
   * 响应格式：
   * - 'json_object' — 启用 JSON mode（所有知识卡生成 Agent 都用此模式）
   * - 'text' — 普通文本（Planner / Recommendation intent 等用此模式）
   */
  responseFormat?: 'json_object' | 'text'

  /**
   * 请求超时（毫秒），默认 60_000
   */
  timeout?: number

  // ===== 未来扩展（v2.3+，先占位） =====
  // topP?: number
  // stop?: string[]
  // seed?: number
  // stream?: boolean
  // tools?: ToolDefinition[]
}

/**
 * Token 使用统计 — Cost Dashboard 用
 *
 * 所有 Provider 必须返回此字段（OpenAI 标准响应已包含 usage）
 */
export interface ChatUsage {
  /** 输入 token 数 */
  promptTokens: number

  /** 输出 token 数 */
  completionTokens: number

  /** 总 token 数（= promptTokens + completionTokens） */
  totalTokens: number
}

/**
 * 聊天响应 — Provider.chat() 的返回值
 *
 * 把 OpenAI SDK 的 response.choices[0].message.content + usage + model
 * 扁平化为单一对象，方便 Agent 处理
 */
export interface ChatResponse {
  /** LLM 返回的内容（可能为 null — 如 function_call only 模式） */
  content: string | null

  /** 实际使用的模型名（可能与请求的 model 不同，如 OpenRouter 会路由） */
  model: string

  /** Token 统计 — D6 Cost Dashboard 用 */
  usage: ChatUsage

  /** 完成原因：'stop' | 'length' | 'tool_calls' | 'content_filter' */
  finishReason?: string

  /** 调用耗时（毫秒）— Agent Timeline 升级用 */
  durationMs: number
}

// ============================================================================
// LLMProvider Interface — 所有 Provider 必须实现
// ============================================================================

/**
 * Provider 能力清单 — UI 显示和校验用
 */
export interface ProviderCapabilities {
  /** 是否支持 JSON mode（response_format: { type: 'json_object' }） */
  supportsJsonMode: boolean

  /** 是否支持流式输出（未来 v2.3 启用） */
  supportsStreaming: boolean

  /** 是否支持 function calling / tool use（未来 v2.3 启用） */
  supportsToolUse: boolean

  /** 最大上下文长度（如 GPT-4o 是 128000，DeepSeek-v4 是 64000） */
  maxContextLength: number

  /** 支持的模型列表（可选，UI 下拉用） */
  availableModels?: string[]
}

/**
 * LLMProvider 统一接口
 *
 * 所有 Provider（OpenAI / DeepSeek / OpenRouter / Groq / Custom）必须实现。
 *
 * 新增 Provider 只需：
 * 1. `class XxxProvider implements LLMProvider`
 * 2. 在 ProviderFactory.create() 中加 case
 *
 * Agent 调用方完全无感：
 * ```typescript
 * const provider = ProviderFactory.fromEnv()  // 或 fromUserConfig
 * const response = await provider.chat(messages, { responseFormat: 'json_object' })
 * const data = JSON.parse(response.content!)
 * ```
 */
export interface LLMProvider {
  /** Provider 名称（'openai' / 'deepseek' / 'openrouter' / 'groq' / 'custom'） */
  name: string

  /** 显示名（'OpenAI' / 'DeepSeek' / 'OpenRouter' — UI 用） */
  displayName: string

  /**
   * 聊天接口 — 所有 Agent 的唯一入口
   *
   * @param messages 聊天消息数组（必须含 system message）
   * @param options 调用选项（可选）
   * @returns ChatResponse（含 content + usage + durationMs）
   */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>

  /** Provider 能力清单 */
  capabilities: ProviderCapabilities

  /**
   * 健康检查 — Settings 页"测试连接"按钮用
   *
   * @returns true 表示 API Key 和 Base URL 配置正确
   */
  healthCheck?(): Promise<boolean>
}

// ============================================================================
// Provider 配置 — ProviderFactory.create() 的入参
// ============================================================================

/**
 * Provider 类型枚举
 *
 * 工厂按此字段决定实例化哪个 Provider class
 * D2 起所有类型都映射到 OpenAICompatProvider（因为都是 OpenAI Compatible API）
 */
export type ProviderType = 'openai' | 'deepseek' | 'openrouter' | 'groq' | 'custom'

/**
 * Provider 配置
 *
 * - ProviderFactory.create(config) — 显式构造（程序内部）
 * - ProviderFactory.fromEnv() — 从环境变量读取（向后兼容 v1.0）
 * - ProviderFactory.fromUserConfig(userConfig) — 从用户 localStorage 读取（D3 Settings UI）
 */
export interface ProviderConfig {
  /** Provider 类型 — 工厂按此字段创建 */
  type: ProviderType

  /** API Base URL（如 'https://api.deepseek.com/v1'） */
  baseURL: string

  /** API Key */
  apiKey: string

  /** 默认模型名（如 'deepseek-v4-flash'） */
  model: string

  /** 默认温度（可被 ChatOptions 覆盖）— 默认 0.3 */
  defaultTemperature?: number

  /** 默认 max_tokens（可被 ChatOptions 覆盖）— 默认不限制 */
  defaultMaxTokens?: number

  /** 请求超时（毫秒）— 默认 60_000 */
  timeout?: number

  /**
   * 自定义请求头（可选）
   *
   * 例：
   * - OpenRouter 需要 `HTTP-Referer` 和 `X-Title`
   * - 火山引擎需要 `Authorization`
   */
  headers?: Record<string, string>
}

// ============================================================================
// Provider Factory — 创建 Provider 实例的统一入口
// ============================================================================

import { OpenAICompatProvider } from './providers/openai-compat'

/**
 * Provider 工厂 — 所有 Provider 创建都走此入口
 *
 * 三种创建方式：
 * 1. create(config) — 显式构造（程序内部）
 * 2. fromEnv() — 从环境变量读取（向后兼容 v1.0）
 * 3. fromUserConfig(userConfig) — 从用户 localStorage 读取（D3 Settings UI）
 *
 * D2 实现：所有 type 都映射到 OpenAICompatProvider
 * 因为 OpenAI / DeepSeek / OpenRouter / Groq / 火山 / 百炼 都是 OpenAI Compatible API
 */
export class ProviderFactory {
  /**
   * 根据 config 创建 Provider 实例
   *
   * 所有 type 都映射到 OpenAICompatProvider
   * 因为 OpenAI / DeepSeek / OpenRouter / Groq / 火山 / 百炼 都是 OpenAI Compatible API
   *
   * @example
   * ```typescript
   * const provider = ProviderFactory.create({
   *   type: 'deepseek',
   *   baseURL: 'https://api.deepseek.com/v1',
   *   apiKey: 'sk-xxx',
   *   model: 'deepseek-v4-flash',
   * })
   * const response = await provider.chat(messages)
   * ```
   */
  static create(config: ProviderConfig): LLMProvider {
    validateConfig(config)
    return new OpenAICompatProvider(config)
  }

  /**
   * 从环境变量创建默认 Provider（向后兼容 v1.0）
   *
   * 读取的环境变量：
   * - OPENAI_API_KEY — API Key
   * - OPENAI_BASE_URL — Base URL（默认 'https://api.deepseek.com/v1'）
   * - LLM_MODEL — 模型名（默认 'deepseek-v4-flash'）
   *
   * lib/llm.ts 和所有 Agent 内部使用：
   * ```typescript
   * const provider = ProviderFactory.fromEnv()
   * const response = await provider.chat(messages, options)
   * ```
   */
  static fromEnv(): LLMProvider {
    const apiKey = process.env.OPENAI_API_KEY?.trim()
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY 未设置 — 请在 .env.local 中配置（或 D3 起在 Settings UI 配置）'
      )
    }

    const baseURL = (process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1').trim()
    const model = (process.env.LLM_MODEL || 'deepseek-v4-flash').trim()

    return ProviderFactory.create({
      type: detectProviderTypeFromBaseURL(baseURL),
      baseURL,
      apiKey,
      model,
    })
  }

  /**
   * 从用户配置（localStorage）创建 Provider
   *
   * D3 实现后，Settings 页保存时调用：
   * ```typescript
   * const provider = ProviderFactory.fromUserConfig(localStorage.get('researchkit:provider'))
   * ```
   *
   * @param userConfig 用户保存的配置（从 localStorage 读取的 JSON）
   */
  static fromUserConfig(userConfig: unknown): LLMProvider {
    if (!isValidUserConfig(userConfig)) {
      // 配置无效 → fallback 到环境变量
      return ProviderFactory.fromEnv()
    }

    const config = userConfig as ProviderConfig
    return ProviderFactory.create(config)
  }
}

// ============================================================================
// 内部辅助函数
// ============================================================================

function validateConfig(config: ProviderConfig): void {
  if (!config.apiKey || config.apiKey.trim() === '') {
    throw new Error('ProviderConfig.apiKey 不能为空')
  }
  if (!config.baseURL || config.baseURL.trim() === '') {
    throw new Error('ProviderConfig.baseURL 不能为空')
  }
  if (!config.model || config.model.trim() === '') {
    throw new Error('ProviderConfig.model 不能为空')
  }
}

function detectProviderTypeFromBaseURL(baseURL: string): ProviderType {
  const url = baseURL.toLowerCase()
  if (url.includes('deepseek.com')) return 'deepseek'
  if (url.includes('openrouter.ai')) return 'openrouter'
  if (url.includes('groq.com')) return 'groq'
  if (url.includes('openai.com')) return 'openai'
  return 'custom'
}

function isValidUserConfig(config: unknown): config is ProviderConfig {
  if (!config || typeof config !== 'object') return false
  const c = config as Record<string, unknown>
  return (
    typeof c.type === 'string' &&
    typeof c.baseURL === 'string' &&
    typeof c.apiKey === 'string' &&
    typeof c.model === 'string'
  )
}

// ============================================================================
// Provider 预设 — D3 Settings UI 下拉用
// ============================================================================

/**
 * 预设 Provider 模板
 *
 * Settings UI 显示：
 * ```
 * Provider: [DeepSeek ▼]
 *           ├─ DeepSeek (性价比最高，中文友好)
 *           ├─ OpenAI (官方 OpenAI)
 *           ├─ OpenRouter (一个 key 调用所有模型)
 *           ├─ Groq (Llama 模型 + 极速推理)
 *           └─ Custom OpenAI Compatible (任意 OpenAI Compatible API)
 * ```
 *
 * 用户选择预设后自动填 Base URL + 默认 Model，只需填 API Key
 */
export interface ProviderPreset {
  type: ProviderType
  name: string
  baseURL: string
  defaultModel: string
  docsUrl: string
  description: string
}

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    type: 'deepseek',
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-v4-flash',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    description: '性价比最高，中文友好',
  },
  {
    type: 'openai',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    docsUrl: 'https://platform.openai.com/api-keys',
    description: '官方 OpenAI',
  },
  {
    type: 'openrouter',
    name: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    docsUrl: 'https://openrouter.ai/keys',
    description: '一个 key 调用所有模型',
  },
  {
    type: 'groq',
    name: 'Groq',
    baseURL: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.1-70b-versatile',
    docsUrl: 'https://console.groq.com/keys',
    description: 'Llama 模型 + 极速推理',
  },
  {
    type: 'custom',
    name: 'Custom OpenAI Compatible',
    baseURL: '',
    defaultModel: '',
    docsUrl: '',
    description: '任意 OpenAI Compatible API（如硅基流动 / 火山 / 百炼 / 混元）',
  },
] as const

// ============================================================================
// Token Cost 估算 — D6 Cost Dashboard 用
// ============================================================================

/**
 * 模型定价（USD / 1M tokens）
 *
 * 来源：各厂商官网（2026-07 价格，可能变动）
 *
 * 用于 Cost Dashboard 估算单次 Pipeline 总花费
 * 不接入 API，纯本地计算
 *
 * 未列出的模型用 _default 估算（按 DeepSeek 价格）
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // DeepSeek
  'deepseek-v4-flash': { input: 0.14, output: 0.28 },
  'deepseek-v4-pro':   { input: 0.55, output: 1.10 },

  // OpenAI
  'gpt-4o':            { input: 2.50, output: 10.00 },
  'gpt-4o-mini':       { input: 0.15, output: 0.60 },
  'gpt-4-turbo':       { input: 10.00, output: 30.00 },

  // OpenRouter（按路由到的实际模型定价，这里只列几个常见的）
  'openai/gpt-4o-mini': { input: 0.15, output: 0.60 },
  'anthropic/claude-3.5-sonnet': { input: 3.00, output: 15.00 },

  // Groq（Llama 系列免费层有限额，超出按下面估算）
  'llama-3.1-70b-versatile': { input: 0.59, output: 0.79 },
  'llama-3.1-8b-instant':    { input: 0.05, output: 0.08 },

  // 通用 fallback（按 DeepSeek 价格估算）
  _default: { input: 0.15, output: 0.30 },
}

/**
 * 估算 token 花费
 *
 * @param model 模型名
 * @param usage token 使用统计
 * @returns USD 金额（如 0.0017 表示 $0.0017）
 *
 * @example
 * ```typescript
 * const cost = estimateTokenCost('deepseek-v4-flash', {
 *   promptTokens: 12300,
 *   completionTokens: 3400,
 *   totalTokens: 15700,
 * })
 * // → 0.0017 (USD)
 * console.log(`Total cost: $${cost.toFixed(4)}`)
 * ```
 */
export function estimateTokenCost(model: string, usage: ChatUsage): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING._default
  return (usage.promptTokens * pricing.input + usage.completionTokens * pricing.output) / 1_000_000
}

// ============================================================================
// v2.1 D2 完成 — D3 任务清单
// ============================================================================

/**
 * D3 待实现：
 *
 * 1. 新建 components/settings/ 目录
 *    - SettingsContainer.tsx — 6 Tab 容器
 *    - tabs/ProviderTab.tsx — Provider 配置表单
 *    - tabs/GeneralTab.tsx — Output Language / Default Preset
 *
 * 2. Settings UI 保存到 localStorage
 *    - key: 'researchkit:provider'
 *    - value: ProviderConfig JSON
 *
 * 3. lib/llm.ts 和 Agent 改用 ProviderFactory.fromUserConfig()
 *    - 先尝试从 localStorage 读取
 *    - 失败则 fallback 到 fromEnv()
 *
 * 4. ProviderTab 设计：
 *    - Provider 下拉（5 个预设 + Custom）
 *    - 选预设后自动填 baseURL + 默认 model
 *    - API Key 输入框（password 模式）
 *    - "测试连接" 按钮（调 healthCheck）
 *    - "保存" 按钮
 */

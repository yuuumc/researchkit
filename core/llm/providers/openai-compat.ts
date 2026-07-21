/**
 * OpenAI Compatible Provider
 *
 * v2.1 Stage 1 — D2 任务
 *
 * 覆盖所有 OpenAI Compatible API：
 * - DeepSeek (https://api.deepseek.com/v1)
 * - OpenAI (https://api.openai.com/v1)
 * - OpenRouter (https://openrouter.ai/api/v1)
 * - Groq (https://api.groq.com/openai/v1)
 * - 硅基流动 (https://api.siliconflow.cn/v1)
 * - 火山引擎 (https://ark.cn-beijing.volces.com/api/v3)
 * - 阿里百炼 (https://dashscope.aliyuncs.com/compatible-mode/v1)
 * - 腾讯混元 (https://api.hunyuan.cloud.tencent.com/v1)
 * - 任意自定义 OpenAI Compatible API
 *
 * 设计：
 * - 内部用 openai SDK（已有依赖）
 * - chat() 返回统一 ChatResponse（含 content + usage + durationMs）
 * - 支持 ChatOptions: temperature / maxTokens / responseFormat / timeout
 * - 健康检查：发送一个最小请求，验证 API Key + Base URL 有效
 *
 * 不支持（v2.3+）：
 * - Streaming
 * - Tool use / Function calling
 * - 多模态（图片 / 音频）
 */

import OpenAI from 'openai'
import type {
  LLMProvider,
  ProviderCapabilities,
  ProviderConfig,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ChatUsage,
} from '../provider'

// ============================================================================
// OpenAICompatProvider — 所有 OpenAI Compatible API 的统一实现
// ============================================================================

export class OpenAICompatProvider implements LLMProvider {
  readonly name: string
  readonly displayName: string
  readonly capabilities: ProviderCapabilities

  private readonly client: OpenAI
  private readonly model: string
  private readonly defaultTemperature: number
  private readonly defaultMaxTokens: number | undefined
  private readonly defaultTimeout: number

  constructor(config: ProviderConfig) {
    this.name = config.type
    this.displayName = getDisplayName(config.type)

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: config.timeout ?? 60_000,
      defaultHeaders: buildProviderHeaders(config),
    })

    this.model = config.model
    this.defaultTemperature = config.defaultTemperature ?? 0.3
    this.defaultMaxTokens = config.defaultMaxTokens
    this.defaultTimeout = config.timeout ?? 60_000

    this.capabilities = getCapabilities(config.type)
  }

  /**
   * 主调用 — 所有 Agent 的统一入口
   *
   * 返回统一 ChatResponse，含 content + usage + durationMs
   *
   * @example
   * ```typescript
   * const response = await provider.chat(
   *   [
   *     { role: 'system', content: 'You are a helpful assistant.' },
   *     { role: 'user', content: 'Hello!' },
   *   ],
   *   { responseFormat: 'json_object' }
   * )
   * console.log(response.content)    // LLM 返回内容
   * console.log(response.usage)      // { promptTokens, completionTokens, totalTokens }
   * console.log(response.durationMs) // 调用耗时
   * ```
   */
  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const start = Date.now()

    const response = await this.client.chat.completions.create(
      {
        model: this.model,
        messages,
        temperature: options?.temperature ?? this.defaultTemperature,
        ...(options?.maxTokens && { max_tokens: options.maxTokens }),
        ...(options?.responseFormat === 'json_object' && {
          response_format: { type: 'json_object' },
        }),
      },
      {
        timeout: options?.timeout ?? this.defaultTimeout,
      }
    )

    const content = response.choices[0]?.message?.content ?? null
    const usage = response.usage
    const chatUsage: ChatUsage = {
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
    }

    return {
      content,
      model: response.model ?? this.model,
      usage: chatUsage,
      finishReason: response.choices[0]?.finish_reason ?? undefined,
      durationMs: Date.now() - start,
    }
  }

  /**
   * 健康检查 — 发送一个最小请求，验证 API Key + Base URL + Model
   *
   * Settings 页"测试连接"按钮用
   *
   * @returns true 表示配置有效
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: [
            { role: 'system', content: 'Reply with "ok".' },
            { role: 'user', content: 'ping' },
          ],
          max_tokens: 10,
          temperature: 0,
        },
        {
          timeout: 15_000,
        }
      )
      // 只要请求成功返回（有 choices）就算连接有效
      // 某些 Provider 在 max_tokens=10 时返回空 content，但仍说明 API Key + Base URL 有效
      const hasChoices = response.choices && response.choices.length > 0
      const content = response.choices[0]?.message?.content
      console.log(`[healthCheck] ${this.displayName}/${this.model} → choices=${response.choices?.length}, content="${content?.substring(0, 50)}"`)
      return Boolean(hasChoices)
    } catch (err) {
      console.error(`[healthCheck] ${this.displayName}/${this.model} failed:`, err instanceof Error ? err.message : err)
      return false
    }
  }
}

// ============================================================================
// 辅助函数 — Provider 元数据
// ============================================================================

function getDisplayName(type: string): string {
  const names: Record<string, string> = {
    openai: 'OpenAI',
    deepseek: 'DeepSeek',
    openrouter: 'OpenRouter',
    groq: 'Groq',
    custom: 'Custom OpenAI Compatible',
  }
  return names[type] ?? 'Custom'
}

function getCapabilities(type: string): ProviderCapabilities {
  // 所有 OpenAI Compatible API 都支持 JSON mode（response_format）
  // Streaming / Tool use 暂不启用（v2.3+）
  const common: ProviderCapabilities = {
    supportsJsonMode: true,
    supportsStreaming: false,
    supportsToolUse: false,
    maxContextLength: 64_000, // 默认 64K，D3 Settings UI 可让用户覆盖
  }

  // 各 Provider 已知模型列表（可选，UI 下拉用）
  const modelsByProvider: Record<string, string[]> = {
    deepseek: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    openrouter: [], // OpenRouter 模型太多，不预设
    groq: ['llama-3.1-70b-versatile', 'llama-3.1-8b-instant'],
    custom: [],
  }

  return {
    ...common,
    availableModels: modelsByProvider[type] ?? [],
  }
}

/**
 * 构建 Provider 特定的请求头
 *
 * - OpenRouter 推荐 HTTP-Referer + X-Title（用于 ranking）
 * - 其他 Provider 默认无特殊头
 */
function buildProviderHeaders(config: ProviderConfig): Record<string, string> | undefined {
  const headers: Record<string, string> = { ...config.headers }

  if (config.type === 'openrouter') {
    if (!headers['HTTP-Referer']) {
      headers['HTTP-Referer'] = 'https://github.com/yuuumc/researchkit'
    }
    if (!headers['X-Title']) {
      headers['X-Title'] = 'ResearchKit'
    }
  }

  return Object.keys(headers).length > 0 ? headers : undefined
}

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
 * - Tool use / Function calling
 * - 多模态（图片 / 音频）
 *
 * v2.3 D27 起支持：
 * - Streaming（chatStream() — OpenAI SDK stream: true + stream_options.include_usage）
 */

import OpenAI from 'openai'
import type {
  LLMProvider,
  ProviderCapabilities,
  ProviderConfig,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ChatStreamCallbacks,
  ChatUsage,
} from '../provider'
import { recordUsage } from '@/lib/usage-collector'

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
  /**
   * v2.3.3 fix — 标记用户是否在 Provider Tab 显式设置了 defaultTemperature
   * true 时,chat()/chatStream() 会用 this.defaultTemperature 覆盖 agent 传入的 options.temperature
   * false(未设置 / 用默认值 0.3)时,沿用 agent 各自的硬编码 temperature
   */
  private readonly hasCustomTemperature: boolean
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
    // v2.3.3 fix — 用户显式设置 defaultTemperature 时,hasCustomTemperature=true
    // 注意: fromEnv() 不设 defaultTemperature,所以 env 模式下 hasCustomTemperature=false(保持旧行为)
    this.hasCustomTemperature = config.defaultTemperature !== undefined
    this.defaultTemperature = config.defaultTemperature ?? 0.3
    this.defaultMaxTokens = config.defaultMaxTokens
    this.defaultTimeout = config.timeout ?? 60_000

    this.capabilities = getCapabilities(config.type)
  }

  /**
   * v2.3.3 fix — 解析 max_tokens 优先级
   *
   * 1. per-call options.maxTokens(优先级最高)
   * 2. config.defaultMaxTokens(fallback,用户在 ProviderConfig 设置但 UI 未暴露)
   * 3. undefined(不传给 OpenAI API,让模型用默认值)
   *
   * 之前 defaultMaxTokens 字段在 config 中存储但从未应用,是 dead config
   * 现在作为 fallback 生效,与 temperature 行为一致
   */
  private resolveMaxTokens(callMaxTokens?: number): number | undefined {
    if (typeof callMaxTokens === 'number' && callMaxTokens > 0) return callMaxTokens
    if (typeof this.defaultMaxTokens === 'number' && this.defaultMaxTokens > 0) return this.defaultMaxTokens
    return undefined
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
        // v2.3.3 fix — 用户显式设置 defaultTemperature 时覆盖 agent 硬编码值
        temperature: this.hasCustomTemperature
          ? this.defaultTemperature
          : (options?.temperature ?? this.defaultTemperature),
        // v2.3.3 fix — 优先用 per-call options.maxTokens,其次用 config.defaultMaxTokens(fallback),最后不限
        ...(this.resolveMaxTokens(options?.maxTokens) && {
          max_tokens: this.resolveMaxTokens(options?.maxTokens),
        }),
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

    const durationMs = Date.now() - start
    const actualModel = response.model ?? this.model

    // D6 Cost & Token Dashboard — 记录到当前 collector（如有）
    recordUsage(chatUsage, actualModel, durationMs)

    return {
      content,
      model: actualModel,
      usage: chatUsage,
      finishReason: response.choices[0]?.finish_reason ?? undefined,
      durationMs,
    }
  }

  /**
   * 流式聊天 — D27 新增
   *
   * 与 chat() 返回相同的 ChatResponse，但通过 onToken 回调实时推送每个 delta。
   * 内部用 OpenAI SDK 的 stream: true + stream_options.include_usage。
   *
   * 调用方：
   * ```typescript
   * const response = await provider.chatStream(messages, { responseFormat: 'json_object' }, {
   *   onToken: (delta) => sendToClient(delta),
   * })
   * // response.content 包含完整内容，response.usage 在流末尾由 SDK 发送
   * ```
   *
   * Provider 不支持 stream_options.include_usage 时，usage 全为 0（Cost Dashboard 优雅降级）
   */
  async chatStream(
    messages: ChatMessage[],
    options?: ChatOptions,
    callbacks?: ChatStreamCallbacks
  ): Promise<ChatResponse> {
    const start = Date.now()

    const stream = await this.client.chat.completions.create(
      {
        model: this.model,
        messages,
        // v2.3.3 fix — 用户显式设置 defaultTemperature 时覆盖 agent 硬编码值
        temperature: this.hasCustomTemperature
          ? this.defaultTemperature
          : (options?.temperature ?? this.defaultTemperature),
        // v2.3.3 fix — 优先用 per-call options.maxTokens,其次用 config.defaultMaxTokens(fallback),最后不限
        ...(this.resolveMaxTokens(options?.maxTokens) && {
          max_tokens: this.resolveMaxTokens(options?.maxTokens),
        }),
        ...(options?.responseFormat === 'json_object' && {
          response_format: { type: 'json_object' },
        }),
        stream: true,
        // 让 OpenAI SDK 在流末尾发送 usage chunk
        // DeepSeek / OpenAI / OpenRouter 均支持；Groq 支持；其他不支持时 usage 全为 0
        stream_options: { include_usage: true },
      },
      {
        timeout: options?.timeout ?? this.defaultTimeout,
      }
    )

    let content = ''
    let actualModel = this.model
    let finishReason: string | undefined
    let chatUsage: ChatUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

    for await (const chunk of stream) {
      // 大部分 chunk 有 choices[0]，但 usage-only chunk（流末尾）choices 可能为空数组
      const choice = chunk.choices?.[0]
      const delta = choice?.delta?.content
      if (delta) {
        content += delta
        callbacks?.onToken?.(delta)
      }
      if (chunk.model) actualModel = chunk.model
      if (choice?.finish_reason) finishReason = choice.finish_reason
      if (chunk.usage) {
        chatUsage = {
          promptTokens: chunk.usage.prompt_tokens ?? 0,
          completionTokens: chunk.usage.completion_tokens ?? 0,
          totalTokens: chunk.usage.total_tokens ?? 0,
        }
      }
    }

    const durationMs = Date.now() - start

    // D6 Cost & Token Dashboard — 记录到当前 collector（如有）
    recordUsage(chatUsage, actualModel, durationMs)

    return {
      content: content || null,
      model: actualModel,
      usage: chatUsage,
      finishReason: finishReason ?? 'stop',
      durationMs,
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
  // D27 起：所有 Provider 都支持 streaming（OpenAI SDK 的 stream: true 是标准协议）
  // Tool use 暂不启用（v2.3+）
  const common: ProviderCapabilities = {
    supportsJsonMode: true,
    supportsStreaming: true,
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

/**
 * Server-side Provider 获取 — D3 Settings UI 配套
 *
 * 在 server side 优先读 cookie 中的用户 Provider 配置（非敏感字段：type/baseURL/model）
 * 失败则 fallback 到 ProviderFactory.fromEnv()
 *
 * v2.3.2 安全加固（C1）：
 * - cookie 只含非敏感字段（type/baseURL/model），apiKey 已移出 cookie
 * - 读到 cookie 配置时，apiKey 从环境变量 OPENAI_API_KEY 补全
 * - 读不到 cookie 或 cookie 无效时，回退到 env
 *
 * 使用场景：
 * - 所有 Agent / lib/llm.ts / lib/planner.ts 中的 LLM 调用
 * - 在 Next.js server runtime 中执行（被 API route 调用）
 */

import { cookies } from 'next/headers'
import { ProviderFactory, type LLMProvider, type ProviderConfig } from '@/core/llm/provider'
import { getUserConfigFromCookieValue, USER_CONFIG_COOKIE_KEY } from './user-config'

/**
 * 获取当前生效的 Provider
 *
 * 优先级：
 * 1. 用户在 Settings 页保存的配置（cookie 中的 type/baseURL/model + env 的 apiKey）
 * 2. 环境变量（.env.local）— fallback
 */
export function getServerProvider(): LLMProvider {
  // 1. 尝试从 cookie 读取用户配置（v2.3.2: 只含非敏感字段）
  try {
    const cookieStore = cookies()
    const providerCookie = cookieStore.get(USER_CONFIG_COOKIE_KEY)
    if (providerCookie) {
      const cookieConfig: ProviderConfig | null = getUserConfigFromCookieValue(providerCookie.value)
      if (cookieConfig) {
        // v2.3.2 (C1) — apiKey 从 env 补全（cookie 不再存 apiKey）
        const envApiKey = process.env.OPENAI_API_KEY || ''
        const fullConfig: ProviderConfig = {
          ...cookieConfig,
          apiKey: envApiKey || cookieConfig.apiKey, // env 优先，cookie 残留 apiKey 兜底（向后兼容）
        }
        // 如果 apiKey 仍为空，无法调用 LLM，回退到 fromEnv
        if (!fullConfig.apiKey) {
          console.warn('[server-provider] cookie 有配置但 apiKey 为空（env 也未设），fallback 到 env')
          return ProviderFactory.fromEnv()
        }
        return ProviderFactory.fromUserConfig(fullConfig)
      }
    }
  } catch (err) {
    // cookies() 在非 server component 上下文会抛错，此时 fallback 到 env
    console.warn('[server-provider] cookie 读取失败，fallback 到环境变量:', err instanceof Error ? err.message : err)
  }

  // 2. fallback 到环境变量
  return ProviderFactory.fromEnv()
}

/**
 * Server-side Provider 获取 — D3 Settings UI 配套
 *
 * 在 server side 优先读 cookie 中的用户 Provider 配置
 * 失败则 fallback 到 ProviderFactory.fromEnv()
 *
 * 使用场景：
 * - 所有 Agent / lib/llm.ts / lib/planner.ts 中的 LLM 调用
 * - 在 Next.js server runtime 中执行（被 API route 调用）
 *
 * 设计：
 * - next/headers cookies() 是 Next.js 13+ 的 server-only API
 * - lib/llm.ts 等文件都在 server runtime（被 API route 调用）
 */

import { cookies } from 'next/headers'
import { ProviderFactory, type LLMProvider, type ProviderConfig } from '@/core/llm/provider'
import { getUserConfigFromCookieValue, USER_CONFIG_COOKIE_KEY } from './user-config'

/**
 * 获取当前生效的 Provider
 *
 * 优先级：
 * 1. 用户在 Settings 页保存的配置（cookie 中）
 * 2. 环境变量（.env.local）— fallback
 *
 * @example
 * ```typescript
 * // lib/llm.ts
 * const provider = getServerProvider()
 * const response = await provider.chat(messages, options)
 * ```
 */
export function getServerProvider(): LLMProvider {
  // 1. 尝试从 cookie 读取用户配置
  try {
    const cookieStore = cookies()
    const providerCookie = cookieStore.get(USER_CONFIG_COOKIE_KEY)
    if (providerCookie) {
      const userConfig: ProviderConfig | null = getUserConfigFromCookieValue(providerCookie.value)
      if (userConfig) {
        return ProviderFactory.fromUserConfig(userConfig)
      }
    }
  } catch (err) {
    // cookies() 在非 server component 上下文会抛错，此时 fallback 到 env
    console.warn('[server-provider] cookie 读取失败，fallback 到环境变量:', err instanceof Error ? err.message : err)
  }

  // 2. fallback 到环境变量
  return ProviderFactory.fromEnv()
}

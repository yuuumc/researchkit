/**
 * Server-side Provider 获取 — D3 Settings UI 配套
 *
 * 在 server side 优先读 cookie 中的用户 Provider 配置
 * 失败则 fallback 到 ProviderFactory.fromEnv()
 *
 * v2.3.3 fix:
 * - apiKey 通过独立 HttpOnly cookie 传递(由 /api/settings/save-provider-key 设置)
 * - 非 apiKey 字段(type/baseURL/model)继续走原 researchkit-provider cookie
 * - 优先级: apiKey cookie > env OPENAI_API_KEY(兜底)
 *
 * 安全性:
 * - apiKey cookie 是 HttpOnly,JS 不可读(防 XSS)
 * - 与非敏感字段 cookie 分离,即使非敏感 cookie 泄露也不含 apiKey
 */

import { cookies } from 'next/headers'
import { ProviderFactory, type LLMProvider, type ProviderConfig } from '@/core/llm/provider'
import { getUserConfigFromCookieValue, USER_CONFIG_COOKIE_KEY } from './user-config'

/** v2.3.3 fix — apiKey 独立 HttpOnly cookie key(与 save-provider-key route.ts 同步) */
const APIKEY_COOKIE_KEY = 'researchkit-provider-key'

/**
 * 获取当前生效的 Provider
 *
 * 优先级:
 * 1. 用户在 Settings 页保存的配置:
 *    - 非敏感字段(type/baseURL/model)从 researchkit-provider cookie 读
 *    - apiKey 从 researchkit-provider-key HttpOnly cookie 读
 *    - apiKey cookie 缺失时 fallback 到 env OPENAI_API_KEY(向后兼容)
 * 2. 环境变量(.env.local)— 全部 fallback
 */
export function getServerProvider(): LLMProvider {
  // 1. 尝试从 cookie 读取用户配置
  try {
    const cookieStore = cookies()
    const providerCookie = cookieStore.get(USER_CONFIG_COOKIE_KEY)
    const apiKeyCookie = cookieStore.get(APIKEY_COOKIE_KEY)

    if (providerCookie) {
      const cookieConfig: ProviderConfig | null = getUserConfigFromCookieValue(providerCookie.value)
      if (cookieConfig) {
        // v2.3.3 fix — apiKey 优先从 HttpOnly cookie 读,其次 env,最后 cookie 残留(向后兼容)
        const cookieApiKey = apiKeyCookie?.value || ''
        const envApiKey = process.env.OPENAI_API_KEY || ''
        const apiKey = cookieApiKey || envApiKey || cookieConfig.apiKey || ''

        if (!apiKey) {
          console.warn('[server-provider] cookie 有配置但 apiKey 为空(cookie+env 都未设),fallback 到 env')
          return ProviderFactory.fromEnv()
        }

        const fullConfig: ProviderConfig = {
          ...cookieConfig,
          apiKey,
        }
        return ProviderFactory.fromUserConfig(fullConfig)
      }
    }
  } catch (err) {
    // cookies() 在非 server component 上下文会抛错,此时 fallback 到 env
    console.warn('[server-provider] cookie 读取失败,fallback 到环境变量:', err instanceof Error ? err.message : err)
  }

  // 2. fallback 到环境变量
  return ProviderFactory.fromEnv()
}

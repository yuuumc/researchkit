/**
 * Onchain 服务工厂 — D22
 *
 * 根据 mode 返回对应的 OnchainServices 实现
 *
 * 使用方式：
 * ```typescript
 * import { getOnchainServices } from '@/lib/onchain-modes'
 * const services = getOnchainServices('mock')
 * const tx = await services.txSigner.sendTx({ ... })
 * ```
 */

import type { OnchainMode, OnchainServices } from '@/types/onchain'
import { getMockOnchainServices } from './onchain-mock'
import { getRealOnchainServices } from './onchain-real'

/**
 * 根据 mode 返回对应的 OnchainServices
 *
 * @param mode 'mock' | 'real'
 * @returns OnchainServices 实现
 */
export function getOnchainServices(mode: OnchainMode): OnchainServices {
  switch (mode) {
    case 'mock':
      return getMockOnchainServices()
    case 'real':
      return getRealOnchainServices()
    default:
      // 默认 mock（安全 fallback）
      return getMockOnchainServices()
  }
}

/**
 * 解析 PluginConfig 中的 mode
 * - 默认 'mock'
 * - 仅当 config.mode === 'real' 时才走真实实现
 *
 * P0-4 修复：real mode 尚未实现（6 接口全部 throw NotImplementedError），
 * 当前强制 fallback 到 mock + console.warn，避免用户在 UI 选 real 后遇到"链上发布失败"泛泛错误。
 * D23/D24 接入真实 SDK 后移除此 fallback。
 */
export function resolveOnchainMode(config: Record<string, string | boolean>): OnchainMode {
  if (config.mode === 'real') {
    if (typeof console !== 'undefined') {
      console.warn('[onchain] real mode not yet implemented (D23/D24 roadmap), falling back to mock')
    }
    return 'mock'
  }
  return 'mock'
}


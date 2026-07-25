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
 */
export function resolveOnchainMode(config: Record<string, string | boolean>): OnchainMode {
  return config.mode === 'real' ? 'real' : 'mock'
}

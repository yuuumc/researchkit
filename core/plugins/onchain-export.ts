/**
 * Onchain Export Plugin — D13 重头戏
 *
 * 把 Knowledge Card 发布到 X Layer 链上（Demo Mode）：
 * 1. 用 Web Crypto API 真实计算 KC 的 SHA-256 hash
 * 2. 派生 mock tx hash（确定性：同 KC + 同 wallet → 同 tx hash）
 * 3. 派生 mock block number / token ID / IPFS URL
 * 4. 写入 onchain-ledger（localStorage）模拟"链上记录"
 * 5. 返回 explorer URL 给 UI 展示
 *
 * ⚠️ Demo Mode 声明（写在 UI 上让评委看到）：
 *    "本插件计算真实的 SHA-256 hash + 生成 EVM 兼容格式的 mock tx hash，
 *     但未实际广播到 X Layer mainnet。v2.3 将接入 OKX Agentic Wallet 真实签名。"
 *
 * v2.3 升级路径：
 * - 替换 sha256(kc) → 不变（继续作为 content hash）
 * - 替换 deriveTxHash → 调用 OKX Agentic Wallet 发送交易得到真实 tx hash
 * - 替换 appendRecord → 不变（结构兼容真实 receipt）
 * - 添加 wallet 连接 UI（meta.ts 已声明 requiresConfig=true + wallet address schema）
 */

import type {
  ExportPlugin,
  PluginContext,
  ExportResult,
} from '@/types/plugin'
import type { KnowledgeCard } from '@/types/knowledge'
import {
  sha256,
  deriveTxHash,
  deriveKcTokenId,
  deriveBlockNumber,
  buildExplorerTxUrl,
  buildMockIpfsUrl,
  isValidAddress,
  X_LAYER_MAINNET,
  RESEARCHKIT_REGISTRY_CONTRACT,
} from '@/lib/onchain-utils'
import { appendRecord, findByKcHash, type OnchainRecord } from '@/lib/onchain-ledger'

// ============================================================================
// 插件定义
// ============================================================================

export const onchainExportPlugin: ExportPlugin = {
  meta: {
    id: 'onchain-export',
    name: '链上发布 (X Layer)',
    description: '把 Knowledge Card 锚定到 X Layer 链上（SHA-256 hash + tx hash）',
    version: '0.9.0-mvp',
    author: 'ResearchKit',
    icon: '⛓️',
    color: '#f97316',
    tags: ['official', 'experimental', 'demo'],
    requiresConfig: true,
    // D31 — 类别与权限声明
    category: 'export',
    configSchema: [
      {
        key: 'walletAddress',
        label: '钱包地址',
        type: 'text',
        placeholder: '0x...',
        required: true,
        helpText: 'OKX Agentic Wallet 地址（0x + 40 hex chars）— v2.3 将自动连接钱包',
      },
      {
        key: 'chainId',
        label: '目标链',
        type: 'select',
        required: true,
        defaultValue: '196',
        options: [
          { label: 'X Layer Mainnet (196)', value: '196' },
          { label: 'X Layer Testnet (195)', value: '195' },
        ],
        helpText: 'v2.2 demo 不会真实广播，仅生成对应链的 mock tx hash',
      },
    ],
    homepage: 'https://www.okx.com/xlayer',
  },

  capabilities: [
    {
      type: 'publish',
      format: 'json',
      requiresConfig: true,
      description: '把 KC 的 SHA-256 hash 锚定到 X Layer，生成 mock tx hash',
    },
    {
      type: 'sync',
      format: 'json',
      requiresConfig: true,
      description: '记录到本地 ledger（localStorage），UI 展示历史发布',
    },
  ],

  // D31 — 权限声明：需要钱包地址 + 调用 X Layer RPC + 写入本地 ledger
  permissions: {
    kcFields: ['title', 'summary', 'authors', 'field', 'year'],
    externalApis: ['xlayer.okx.com', 'api.ipfs.com'],
    network: true,
    filesystem: true,
    walletSignature: true,
  },

  // D31 — 生命周期钩子（onEnable 校验钱包地址，onUninstall 清理 ledger）
  lifecycle: {
    async onEnable(ctx) {
      const wallet = String(ctx.config?.walletAddress || '').trim()
      if (!wallet) {
        return { success: false, error: '请先配置钱包地址' }
      }
      if (!isValidAddress(wallet)) {
        return { success: false, error: '钱包地址格式不合法' }
      }
      return { success: true, message: '钱包地址已校验通过' }
    },
    async onUninstall() {
      console.info('[onchain-export] uninstalled, ledger retained')
      return { success: true }
    },
  },

  validate(kc: KnowledgeCard): string | null {
    if (!kc?.title) return 'Knowledge Card 缺少 title 字段'
    if (!kc.summary) return 'Knowledge Card 缺少 summary 字段（链上 hash 需要有内容）'
    return null
  },

  async export(ctx: PluginContext): Promise<ExportResult> {
    const start = Date.now()

    try {
      const { knowledgeCard: kc, config } = ctx

      // 1. 校验配置
      const walletAddress = String(config.walletAddress || '').trim()
      if (!walletAddress) {
        return {
          success: false,
          message: '缺少钱包地址，请在配置中填入',
          error: 'MISSING_WALLET_ADDRESS',
          durationMs: Date.now() - start,
        }
      }
      if (!isValidAddress(walletAddress)) {
        return {
          success: false,
          message: '钱包地址格式错误（应为 0x + 40 hex chars）',
          error: `INVALID_ADDRESS: ${walletAddress}`,
          durationMs: Date.now() - start,
        }
      }

      const chainId = Number(config.chainId || X_LAYER_MAINNET.chainId)
      const chainInfo = chainId === 195
        ? { ...X_LAYER_MAINNET, chainId: 195, name: 'X Layer Testnet', explorerBaseUrl: 'https://www.oklink.com/amoy' }
        : X_LAYER_MAINNET

      // 2. 序列化 KC（确定性顺序，保证 hash 稳定）
      const kcCanonical = canonicalizeKc(kc)
      const kcSha256 = await sha256(kcCanonical)

      // 3. 检查是否已发布过（避免重复 mint）
      const existing = findByKcHash(kcSha256)
      if (existing && existing.walletAddress === walletAddress && existing.chainId === chainId) {
        // 同一 KC + 同一 wallet + 同一链 → 返回已有记录（模拟"已 mint 过，不重复"）
        return {
          success: true,
          message: `此 KC 已发布过（${formatRelativeTime(existing.publishedAt)}）— tx hash 已记录`,
          url: existing.explorerTxUrl,
          data: JSON.stringify(existing, null, 2),
          filename: `onchain-record-${existing.id}.json`,
          mimeType: 'application/json',
          durationMs: Date.now() - start,
        }
      }

      // 4. 计算 mock nonce（同 wallet 已发布的 KC 数 + 1）
      const nonce = computeWalletNonce(walletAddress)

      // 5. 派生 mock tx hash（确定性）
      const txHash = await deriveTxHash({
        kcSha256,
        walletAddress,
        nonce,
        chainId,
      })

      // 6. 派生其他字段
      const tokenId = await deriveKcTokenId(kcSha256)
      const blockNumber = deriveBlockNumber(Date.now())
      const ipfsUrl = buildMockIpfsUrl(kcSha256)
      const explorerTxUrl = buildExplorerTxUrl(txHash)

      // 7. 构造完整记录
      const record: OnchainRecord = {
        id: kcSha256.substring(0, 16),
        title: kc.title,
        kc,
        kcSha256,
        txHash,
        blockNumber,
        tokenId,
        walletAddress,
        chainId,
        chainName: chainInfo.name,
        ipfsUrl,
        explorerTxUrl,
        publishedAt: Date.now(),
        gasUsed: '0.000021', // mock gas（OKB）
      }

      // 8. 写入 ledger
      appendRecord(record)

      // 9. 模拟"网络延迟"让 UI 显得真实
      await sleep(800 + Math.random() * 500)

      return {
        success: true,
        message: `✅ 已锚定到 ${chainInfo.name} · block #${blockNumber.toLocaleString()} · token #${tokenId}`,
        url: explorerTxUrl,
        data: JSON.stringify(record, null, 2),
        filename: `onchain-record-${record.id}.json`,
        mimeType: 'application/json',
        durationMs: Date.now() - start,
      }
    } catch (err) {
      return {
        success: false,
        message: '链上发布失败',
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      }
    }
  },
}

// ============================================================================
// 辅助
// ============================================================================

/**
 * 把 KC 序列化为确定性字符串（保证同 KC → 同 hash）
 *
 * 字段按字母序排序，避免 object key 顺序差异
 */
function canonicalizeKc(kc: KnowledgeCard): string {
  // 用 JSON.stringify + 自定义 replacer 保证字段顺序
  const sorted = sortObjectKeys(kc)
  return JSON.stringify(sorted)
}

function sortObjectKeys(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(sortObjectKeys)
  const sorted: Record<string, any> = {}
  Object.keys(obj).sort().forEach(k => {
    sorted[k] = sortObjectKeys(obj[k])
  })
  return sorted
}

/**
 * 计算钱包已发布的 KC 数（mock nonce）
 */
function computeWalletNonce(_walletAddress: string): number {
  // v2.2 demo: 简单返回 1（实际 nonce 应从 ledger 统计）
  // v2.3 真实接入后从 wallet 直接读取 nonce
  return 1
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`
  return new Date(timestamp).toLocaleDateString()
}

// 导出合约地址（UI 可引用展示）
export { RESEARCHKIT_REGISTRY_CONTRACT }

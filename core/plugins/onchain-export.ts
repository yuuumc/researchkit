/**
 * Onchain Export Plugin — D13 + D22 双模式重构
 *
 * 把 Knowledge Card 发布到 X Layer 链上：
 * - mock 模式（demo 用）：派生 mock tx hash / token ID / IPFS URL
 * - real 模式（D23/D24 填入）：调用 OKX Agentic Wallet + Pinata + viem
 *
 * 1. 用 Web Crypto API 真实计算 KC 的 SHA-256 hash
 * 2. 通过 OnchainServices 接口调用对应的 mock/real 实现
 * 3. 写入 onchain-ledger（localStorage）记录链上状态
 * 4. 返回 explorer URL 给 UI 展示
 *
 * D22 改造点：
 * - 抽出 6 个可替换接口（TxSigner / IpfsUploader / NonceProvider / GasEstimator / ContractCaller / WalletConnector）
 * - mock 模式行为完全不变（保留 v2.2.5 demo 行为）
 * - real 模式通过 D23/D24 填入真实 SDK
 * - 通过 config.mode 切换（默认 'mock'）
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
import { getOnchainServices, resolveOnchainMode } from '@/lib/onchain-modes'

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

      // 0. 解析 mode + 获取 services（D22 双模式）
      const mode = resolveOnchainMode(config)
      const services = getOnchainServices(mode)

      // 1. 校验配置（用 services.walletConnector 校验）
      const walletAddress = String(config.walletAddress || '').trim()
      if (!walletAddress) {
        return {
          success: false,
          message: '缺少钱包地址，请在配置中填入',
          error: 'MISSING_WALLET_ADDRESS',
          durationMs: Date.now() - start,
        }
      }
      if (!services.walletConnector.isValidAddress(walletAddress)) {
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

      // 3. 检查是否已发布过（避免重复 mint）— mock/real 共用
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

      // 4. 调用 services 接口（mock/real 自动切换）
      // 4a. IPFS 上传（获取 ipfsUrl + cid）
      const ipfsResult = await services.ipfsUploader.upload(kcCanonical, kcSha256)

      // 4b. mint KC（获取 tokenId）
      const mintResult = await services.contractCaller.mintKc({
        contractAddress: RESEARCHKIT_REGISTRY_CONTRACT,
        kcSha256,
        ipfsCid: ipfsResult.cid,
        from: walletAddress,
        chainId,
      })

      // 4c. 签名 + 广播交易（获取 txHash + blockNumber + gasUsed）
      const txResult = await services.txSigner.sendTx({
        to: RESEARCHKIT_REGISTRY_CONTRACT,
        data: `0x${kcSha256}${ipfsResult.cid}`,
        from: walletAddress,
        chainId,
      })

      // 5. 构造完整记录（mock/real 共用）
      const explorerTxUrl = buildExplorerTxUrl(txResult.txHash)
      const record: OnchainRecord = {
        id: kcSha256.substring(0, 16),
        title: kc.title,
        kc,
        kcSha256,
        txHash: txResult.txHash,
        blockNumber: txResult.blockNumber,
        tokenId: mintResult.tokenId,
        walletAddress,
        chainId,
        chainName: chainInfo.name,
        ipfsUrl: ipfsResult.url,
        explorerTxUrl,
        publishedAt: Date.now(),
        gasUsed: txResult.gasUsed,
      }

      // 6. 写入 ledger（mock/real 共用）
      appendRecord(record)

      return {
        success: true,
        message: `✅ 已锚定到 ${chainInfo.name} · block #${txResult.blockNumber.toLocaleString()} · token #${mintResult.tokenId}`,
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
 * 计算钱包已发布的 KC 数 — D22 后已迁移到 MockNonceProvider
 * 保留此占位避免破坏 import（如果有外部引用）
 * @deprecated D22 — 改用 services.nonceProvider.getNonce()
 */
function computeWalletNonce(_walletAddress: string): number {
  return 1
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

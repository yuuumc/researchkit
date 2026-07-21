/**
 * Onchain Utilities — D13 Onchain Export Plugin
 *
 * 链上数据生成工具：
 * - SHA-256: 用 Web Crypto API 真实计算 KC 内容的 hash
 * - Mock tx hash: 64 字符 hex（格式与 EVM 兼容链一致）
 * - Mock contract address: 40 字符 hex（带 0x 前缀）
 * - Mock block number: 基于当前时间戳的合理值
 *
 * ⚠️ Demo Mode 声明：
 * 这些 hash 是确定性生成的（同 KC + 同 wallet → 同 tx hash），
 * 让 demo 中"重新发布"得到一致结果，但实际并未上链。
 * v2.3 升级为真实 OKX Agentic Wallet 签名 + X Layer mainnet 广播。
 */

// ============================================================================
// SHA-256（真实计算，用 Web Crypto API）
// ============================================================================

/**
 * 计算字符串的 SHA-256 hash（hex 格式）
 *
 * 用 Web Crypto API：
 * - 浏览器：window.crypto.subtle
 * - Node 18+：globalThis.crypto.subtle
 */
export async function sha256(text: string): Promise<string> {
  const cryptoObj = (typeof globalThis !== 'undefined' && (globalThis as any).crypto) ||
    (typeof window !== 'undefined' && (window as any).crypto)
  if (!cryptoObj?.subtle) {
    // Fallback: 简单 hash（不应出现在 production，但作为兜底）
    return fallbackHash(text)
  }
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await cryptoObj.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 兜底 hash — 仅在 Web Crypto 不可用时使用
 * 简单 FNV-1a 32-bit + 字符串拼接，扩展到 64 hex chars
 */
function fallbackHash(text: string): string {
  let hash1 = 0x811c9dc5
  let hash2 = 0x1b873593
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    hash1 = ((hash1 ^ c) >>> 0) * 0x01000193 >>> 0
    hash2 = ((Math.imul(hash2, 0x85ebca6b) ^ c) >>> 0)
  }
  const h1 = (hash1 >>> 0).toString(16).padStart(8, '0')
  const h2 = (hash2 >>> 0).toString(16).padStart(8, '0')
  // 扩展到 64 hex chars — 重复 8 次
  return (h1 + h2 + h1 + h2 + h1 + h2 + h1 + h2).substring(0, 64)
}

// ============================================================================
// Mock Tx Hash（64 hex chars，符合 EVM 标准）
// ============================================================================

/**
 * 基于 KC hash + wallet 派生确定性的 tx hash
 *
 * 算法：sha256(kcHash + walletAddress + nonce + chainId) 取前 64 字符
 *
 * 同一 KC + 同一 wallet 在同一链上多次调用得到同一 tx hash —
 * 模拟"重新执行不会产生新交易"的真实行为。
 */
export async function deriveTxHash(params: {
  kcSha256: string
  walletAddress: string
  nonce: number
  chainId: number
}): Promise<string> {
  const seed = `${params.kcSha256}|${params.walletAddress}|${params.nonce}|${params.chainId}`
  const fullHash = await sha256(seed + '|tx-salt')
  // EVM tx hash 是 32 字节 = 64 hex chars
  return fullHash.substring(0, 64)
}

// ============================================================================
// Mock Contract Address（40 hex chars + 0x）
// ============================================================================

/**
 * ResearchKit 在 X Layer 上的"合约地址"
 *
 * 在 v2.2 demo 中：所有 KC 都发布到同一个"虚拟合约"
 * v2.3 真实部署后此地址会变成实际部署的合约地址
 */
export const RESEARCHKIT_REGISTRY_CONTRACT = '0x7e3b1c8a4d2f5a6b9c8e7d1f3a4b5c6d7e8f9a0b'

/**
 * 派生 KC 的"链上 ID"（mock storage slot）
 */
export async function deriveKcTokenId(kcSha256: string): Promise<number> {
  // 取 hash 前 8 字符 → 转 number → 限制在 1,000,000 ~ 9,999,999
  const head = parseInt(kcSha256.substring(0, 8), 16)
  return 1_000_000 + (head % 9_000_000)
}

// ============================================================================
// Mock Block Number + Timestamp
// ============================================================================

/**
 * 基于当前时间戳生成 mock block number
 *
 * X Layer mainnet 大约 1 block/2s，genesis block #1 在 2023-08-15
 * 现在约 #5,000,000
 */
export function deriveBlockNumber(timestamp: number): number {
  // 5,000,000 + (timestamp - genesisTimestamp) / 2000ms
  const genesis = Date.UTC(2023, 7, 15) // 2023-08-15
  const elapsed = Math.max(0, timestamp - genesis)
  const blocks = Math.floor(elapsed / 2000) // 2s/block
  return 5_000_000 + blocks
}

/**
 * Explorer URL — OKLink X Layer
 */
export function buildExplorerTxUrl(txHash: string): string {
  return `https://www.oklink.com/xlayer/tx/${txHash}`
}

export function buildExplorerAddressUrl(address: string): string {
  return `https://www.oklink.com/xlayer/address/${address}`
}

/**
 * Mock IPFS gateway URL — 模拟 KC 已上传到 IPFS
 *
 * v2.3 接入真实 Pinata / Web3.Storage 后此 URL 变真实
 */
export function buildMockIpfsUrl(kcSha256: string): string {
  // 取 hash 前 46 字符作为 CID（IPFS CID v1 长度）
  const cid = kcSha256.substring(0, 46) + '0' // 补足 47 字符
  return `https://ipfs.io/ipfs/${cid}`
}

// ============================================================================
// Chain Info
// ============================================================================

export interface ChainInfo {
  chainId: number
  name: string
  shortName: string
  currency: string
  explorerBaseUrl: string
  rpcUrl: string
}

export const X_LAYER_MAINNET: ChainInfo = {
  chainId: 196,
  name: 'X Layer Mainnet',
  shortName: 'xlayer',
  currency: 'OKB',
  explorerBaseUrl: 'https://www.oklink.com/xlayer',
  rpcUrl: 'https://xlayerrpc.okx.com',
}

export const X_LAYER_TESTNET: ChainInfo = {
  chainId: 195,
  name: 'X Layer Testnet',
  shortName: 'xlayer-testnet',
  currency: 'OKB',
  explorerBaseUrl: 'https://www.oklink.com/amoy',
  rpcUrl: 'https://xlayertestrpc.okx.com',
}

// ============================================================================
// Address 校验
// ============================================================================

/**
 * 简单校验钱包地址格式（0x + 40 hex chars）
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address.trim())
}

/**
 * 简化地址显示：0x1234...abcd
 */
export function shortAddress(address: string): string {
  if (!address || address.length < 10) return address
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
}

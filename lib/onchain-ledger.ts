/**
 * Onchain Ledger — D13 Onchain Export Plugin 持久化
 *
 * 记录每次"链上发布"到 localStorage，让 UI 可以展示历史。
 *
 * ⚠️ Demo Mode：实际数据未上链，但持久化到本地让 demo 看起来真实。
 * v2.3 升级：从 OKX Agentic Wallet 读取真实 tx receipt 后写入。
 */

import type { KnowledgeCard } from '@/types/knowledge'

const STORAGE_KEY = 'researchkit:onchain-ledger'

// ============================================================================
// 类型
// ============================================================================

export interface OnchainRecord {
  /** 唯一 ID（= kcSha256 的前 16 字符） */
  id: string
  /** KC 标题 */
  title: string
  /** KC 完整内容（用于复现 hash） */
  kc: KnowledgeCard
  /** KC 的 SHA-256 hash（hex 64 字符） */
  kcSha256: string
  /** Mock tx hash（hex 64 字符） */
  txHash: string
  /** Mock block number */
  blockNumber: number
  /** Mock token ID（KC 在链上的唯一 ID） */
  tokenId: number
  /** 钱包地址（发布者） */
  walletAddress: string
  /** 链 ID（196 = X Layer mainnet） */
  chainId: number
  /** 链名称 */
  chainName: string
  /** IPFS URL（mock） */
  ipfsUrl: string
  /** Explorer URL */
  explorerTxUrl: string
  /** 发布时间戳 */
  publishedAt: number
  /** gas 费（mock，OKB） */
  gasUsed: string
}

export type OnchainLedger = OnchainRecord[]

// ============================================================================
// 读写
// ============================================================================

export function loadLedger(): OnchainLedger {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(stripBom(raw))
    if (!Array.isArray(parsed)) return []
    return parsed as OnchainLedger
  } catch (err) {
    console.warn('[onchain-ledger] load failed:', err)
    return []
  }
}

export function saveLedger(ledger: OnchainLedger): void {
  if (typeof window === 'undefined') return
  try {
    // 限制最多 50 条（FIFO）
    const trimmed = ledger.slice(-50)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch (err) {
    console.warn('[onchain-ledger] save failed:', err)
  }
}

/**
 * 追加一条发布记录 — 自动按 publishedAt 排序
 *
 * 同一 KC（同 kcSha256）多次发布会追加新记录（模拟"重新 mint"）
 */
export function appendRecord(record: OnchainRecord): OnchainLedger {
  const ledger = loadLedger()
  ledger.push(record)
  ledger.sort((a, b) => a.publishedAt - b.publishedAt)
  saveLedger(ledger)
  return ledger
}

/**
 * 按标题查询历史发布记录（UI 用）
 */
export function findByTitle(title: string): OnchainRecord[] {
  const ledger = loadLedger()
  return ledger.filter(r => r.title === title)
}

/**
 * 按 kcSha256 查询（检查是否已发布过）
 */
export function findByKcHash(kcSha256: string): OnchainRecord | undefined {
  const ledger = loadLedger()
  return ledger.find(r => r.kcSha256 === kcSha256)
}

/**
 * 统计某 wallet 已发布的 KC 数（D22 mock nonce 用）
 */
export function countByWallet(walletAddress: string): number {
  const ledger = loadLedger()
  return ledger.filter(r => r.walletAddress === walletAddress).length
}

/**
 * 清空 ledger（设置页用）
 */
export function clearLedger(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch (err) {
    console.warn('[onchain-ledger] clear failed:', err)
  }
}

// ============================================================================
// 辅助
// ============================================================================

function stripBom(s: string): string {
  return s.replace(/^\uFEFF/, '')
}

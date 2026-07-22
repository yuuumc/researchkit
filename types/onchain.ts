/**
 * Onchain 服务接口定义 — D22 Onchain Export 真实化
 *
 * 设计目标：
 * - 抽出 6 个可替换接口，让 onchain-export.ts 从硬编码改为调用接口
 * - mock 模式保留现有行为（sha256 派生 tx hash / token ID / block number）
 * - real 模式调用真实 SDK（OKX Agentic Wallet / Pinata / viem）
 * - 通过 PluginContext.config.mode 切换
 *
 * 6 个接口：
 * 1. WalletConnector — 钱包连接 / 地址校验
 * 2. NonceProvider — 获取 wallet nonce
 * 3. IpfsUploader — 上传 KC JSON 到 IPFS
 * 4. TxSigner — 签名 + 广播交易
 * 5. GasEstimator — 估算 gas
 * 6. ContractCaller — 调用合约方法（mint KC）
 */

import type { KnowledgeCard } from './knowledge'

/**
 * Onchain 模式
 * - 'mock'：纯本地派生（demo 用，无真实广播）
 * - 'real'：调用真实 SDK（OKX Agentic Wallet + Pinata + X Layer RPC）
 */
export type OnchainMode = 'mock' | 'real'

/**
 * 钱包连接结果
 */
export interface WalletConnection {
  /** 钱包地址（0x + 40 hex chars） */
  address: string
  /** chainId */
  chainId: number
  /** 钱包已连接标志 */
  connected: boolean
}

/**
 * WalletConnector — 钱包连接接口
 *
 * mock：从 config.walletAddress 读取，校验格式
 * real：调用 OKX Agentic Wallet SDK 连接浏览器钱包
 */
export interface WalletConnector {
  /**
   * 连接钱包（real 模式会弹 OKX Wallet 连接窗）
   * @returns 钱包地址 + chainId
   */
  connect(): Promise<WalletConnection>
  /**
   * 校验地址格式（mock + real 共用）
   */
  isValidAddress(address: string): boolean
}

/**
 * NonceProvider — 获取 wallet nonce
 *
 * mock：从 ledger 数已发布的 KC 数 + 1
 * real：调用 eth_getTransactionCount
 */
export interface NonceProvider {
  /**
   * @param address 钱包地址
   * @param chainId chainId
   * @returns nonce（已发送的 tx 数）
   */
  getNonce(address: string, chainId: number): Promise<number>
}

/**
 * IPFS 上传结果
 */
export interface IpfsUploadResult {
  /** IPFS CID */
  cid: string
  /** 完整 IPFS URL（如 https://ipfs.io/ipfs/xxx） */
  url: string
}

/**
 * IpfsUploader — 上传 KC JSON 到 IPFS
 *
 * mock：用 kcSha256 派生假 CID
 * real：调用 Pinata / Web3.Storage API 上传
 */
export interface IpfsUploader {
  /**
   * @param content KC JSON 字符串
   * @param kcSha256 KC 的 SHA-256 hash（用于 mock 派生 CID）
   * @returns IPFS CID + URL
   */
  upload(content: string, kcSha256: string): Promise<IpfsUploadResult>
}

/**
 * 交易签名 + 广播结果
 */
export interface TxResult {
  /** 链上 tx hash（0x + 64 hex chars） */
  txHash: string
  /** 区块号（真实广播后才有） */
  blockNumber: number
  /** gas used（OKB） */
  gasUsed: string
}

/**
 * TxSigner — 签名 + 广播交易
 *
 * mock：用 sha256 派生 tx hash
 * real：调用 OKX Agentic Wallet signAndSendTransaction
 */
export interface TxSigner {
  /**
   * @param params 签名参数（to / data / value 等）
   * @returns tx hash + block number + gas
   */
  sendTx(params: {
    to: string
    data: string
    from: string
    chainId: number
    value?: string
  }): Promise<TxResult>
}

/**
 * GasEstimator — 估算 gas
 *
 * mock：返回固定 0.000021 OKB
 * real：调用 eth_estimateGas + eth_gasPrice
 */
export interface GasEstimator {
  /**
   * @param params 同 TxSigner.sendTx
   * @returns gas 用量（OKB）
   */
  estimate(params: {
    to: string
    data: string
    from: string
    chainId: number
  }): Promise<{ gasUsed: string; gasPrice: string; cost: string }>
}

/**
 * ContractCaller — 调用合约方法
 *
 * mock：不调用，返回派生的 tokenId
 * real：调用 viem/ethers contract.write.mint(kcSha256, ipfsCid)
 */
export interface ContractCaller {
  /**
   * mint KC（调用 registry contract 的 mint 方法）
   * @returns tokenId
   */
  mintKc(params: {
    contractAddress: string
    kcSha256: string
    ipfsCid: string
    from: string
    chainId: number
  }): Promise<{ tokenId: number }>
}

/**
 * OnchainServices — 所有 6 个接口的集合
 *
 * onchain-export.ts 通过此对象调用所有链上动作
 */
export interface OnchainServices {
  walletConnector: WalletConnector
  nonceProvider: NonceProvider
  ipfsUploader: IpfsUploader
  txSigner: TxSigner
  gasEstimator: GasEstimator
  contractCaller: ContractCaller
}

/**
 * Onchain 执行上下文（传入 plugin.export）
 */
export interface OnchainContext {
  /** Knowledge Card */
  kc: KnowledgeCard
  /** KC 的 SHA-256 hash */
  kcSha256: string
  /** 钱包地址 */
  walletAddress: string
  /** chainId */
  chainId: number
  /** chain name */
  chainName: string
  /** mode */
  mode: OnchainMode
}

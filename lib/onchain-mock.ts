/**
 * Onchain Mock 服务实现 — D22
 *
 * 封装现有 onchain-utils.ts 的 mock 函数为 OnchainServices 接口实现
 *
 * 行为完全不变（保留 v2.2.5 的 demo 行为）：
 * - tx hash：sha256(kc + wallet + nonce + chainId) 派生
 * - token ID：kcSha256 前 8 字符 mod 9_000_000
 * - block number：按 2s/block 从 2023-08-15 起算
 * - IPFS URL：kcSha256 前 46 字符当 CID
 * - gas：固定 0.000021 OKB
 * - nonce：从 ledger 数已发布 KC 数 + 1
 */

import type {
  WalletConnector,
  WalletConnection,
  NonceProvider,
  IpfsUploader,
  IpfsUploadResult,
  TxSigner,
  TxResult,
  GasEstimator,
  ContractCaller,
  OnchainServices,
} from '@/types/onchain'
import {
  isValidAddress as isValidAddressUtil,
  deriveTxHash,
  deriveKcTokenId,
  deriveBlockNumber,
  buildMockIpfsUrl,
} from './onchain-utils'
import { countByWallet } from './onchain-ledger'

// ============================================================================
// MockWalletConnector
// ============================================================================

class MockWalletConnector implements WalletConnector {
  async connect(): Promise<WalletConnection> {
    // mock 模式不连接钱包，由调用方提供 walletAddress
    // 这里返回空对象，让调用方知道需要从 config 读
    return { address: '', chainId: 0, connected: false }
  }

  isValidAddress(address: string): boolean {
    return isValidAddressUtil(address)
  }
}

// ============================================================================
// MockNonceProvider
// ============================================================================

class MockNonceProvider implements NonceProvider {
  async getNonce(address: string, _chainId: number): Promise<number> {
    // mock：从 ledger 数该 wallet 已发布的 KC 数 + 1
    const count = countByWallet(address)
    return count + 1
  }
}

// ============================================================================
// MockIpfsUploader
// ============================================================================

class MockIpfsUploader implements IpfsUploader {
  async upload(_content: string, kcSha256: string): Promise<IpfsUploadResult> {
    const url = buildMockIpfsUrl(kcSha256)
    // 从 URL 提取 CID
    const cid = url.replace('https://ipfs.io/ipfs/', '')
    return { cid, url }
  }
}

// ============================================================================
// MockTxSigner
// ============================================================================

class MockTxSigner implements TxSigner {
  async sendTx(params: {
    to: string
    data: string
    from: string
    chainId: number
    value?: string
  }): Promise<TxResult> {
    // mock：用 sha256 派生 tx hash
    // 注意：这里不能访问 kcSha256，所以用 params 拼接派生
    const nonce = await new MockNonceProvider().getNonce(params.from, params.chainId)
    const txHash = await deriveTxHash({
      // 用 params.data 作为 kcSha256 的替代（data 通常包含 kcSha256）
      kcSha256: params.data,
      walletAddress: params.from,
      nonce,
      chainId: params.chainId,
    })
    const blockNumber = deriveBlockNumber(Date.now())

    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 500))

    return {
      txHash,
      blockNumber,
      gasUsed: '0.000021', // mock gas（OKB）
    }
  }
}

// ============================================================================
// MockGasEstimator
// ============================================================================

class MockGasEstimator implements GasEstimator {
  async estimate(_params: {
    to: string
    data: string
    from: string
    chainId: number
  }): Promise<{ gasUsed: string; gasPrice: string; cost: string }> {
    // mock：固定 gas
    return {
      gasUsed: '21000',
      gasPrice: '1 gwei',
      cost: '0.000021', // OKB
    }
  }
}

// ============================================================================
// MockContractCaller
// ============================================================================

class MockContractCaller implements ContractCaller {
  async mintKc(params: {
    contractAddress: string
    kcSha256: string
    ipfsCid: string
    from: string
    chainId: number
  }): Promise<{ tokenId: number }> {
    // mock：派生 token ID
    const tokenId = await deriveKcTokenId(params.kcSha256)
    return { tokenId }
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 获取 mock 模式的 OnchainServices
 */
export function getMockOnchainServices(): OnchainServices {
  return {
    walletConnector: new MockWalletConnector(),
    nonceProvider: new MockNonceProvider(),
    ipfsUploader: new MockIpfsUploader(),
    txSigner: new MockTxSigner(),
    gasEstimator: new MockGasEstimator(),
    contractCaller: new MockContractCaller(),
  }
}

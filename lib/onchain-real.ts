/**
 * Onchain Real 服务实现 — D22 stub / D23-D24 填入真实 SDK
 *
 * 当前状态：所有方法 throw NotImplementedError
 * 后续填入：
 * - D23：OKX Agentic Wallet SDK（TxSigner / WalletConnector / GasEstimator / NonceProvider）
 * - D24：Pinata IPFS（IpfsUploader）+ viem（ContractCaller）
 *
 * 环境约束：
 * - OKX Agentic Wallet SDK 需要在浏览器端运行（私钥不离开浏览器）
 * - Pinata API 需要 API key（从环境变量 / Settings 读取）
 * - viem 用 public rpcUrl（X_LAYER_MAINNET.rpcUrl）
 *
 * 注意：此文件在 D22 阶段是 stub，运行时如果 mode='real' 会抛错
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

class NotImplementedError extends Error {
  constructor(method: string) {
    super(`[onchain-real] ${method} not implemented yet — D23/D24 will fill this`)
    this.name = 'NotImplementedError'
  }
}

// ============================================================================
// RealWalletConnector — D23 填入 OKX Agentic Wallet SDK
// ============================================================================

class RealWalletConnector implements WalletConnector {
  async connect(): Promise<WalletConnection> {
    // TODO D23: 调用 OKX Agentic Wallet SDK
    // const wallet = await okxWallet.connect()
    // return { address: wallet.address, chainId: wallet.chainId, connected: true }
    throw new NotImplementedError('WalletConnector.connect')
  }

  isValidAddress(address: string): boolean {
    // 复用 mock 的校验逻辑（格式相同）
    return /^0x[a-fA-F0-9]{40}$/.test(address)
  }
}

// ============================================================================
// RealNonceProvider — D23 填入 eth_getTransactionCount
// ============================================================================

class RealNonceProvider implements NonceProvider {
  async getNonce(address: string, chainId: number): Promise<number> {
    // TODO D23: 调用 viem publicClient.getTransactionCount
    // const client = getPublicClient(chainId)
    // return await client.getTransactionCount({ address })
    void address
    void chainId
    throw new NotImplementedError('NonceProvider.getNonce')
  }
}

// ============================================================================
// RealIpfsUploader — D24 填入 Pinata / Web3.Storage
// ============================================================================

class RealIpfsUploader implements IpfsUploader {
  async upload(content: string, kcSha256: string): Promise<IpfsUploadResult> {
    // TODO D24: 调用 Pinata API
    // const formData = new FormData()
    // formData.append('file', new Blob([content], { type: 'application/json' }))
    // const resp = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    //   method: 'POST',
    //   headers: { Authorization: `Bearer ${pinataJwt}` },
    //   body: formData,
    // })
    // const { IpfsHash } = await resp.json()
    // return { cid: IpfsHash, url: `https://ipfs.io/ipfs/${IpfsHash}` }
    void content
    void kcSha256
    throw new NotImplementedError('IpfsUploader.upload')
  }
}

// ============================================================================
// RealTxSigner — D23 填入 OKX Agentic Wallet signAndSendTransaction
// ============================================================================

class RealTxSigner implements TxSigner {
  async sendTx(params: {
    to: string
    data: string
    from: string
    chainId: number
    value?: string
  }): Promise<TxResult> {
    // TODO D23: 调用 OKX Agentic Wallet SDK
    // const wallet = getConnectedWallet()
    // const txHash = await wallet.signAndSendTransaction({
    //   to: params.to,
    //   data: params.data,
    //   from: params.from,
    //   value: params.value || '0x0',
    // })
    // const receipt = await waitForTxReceipt(txHash)
    // return { txHash, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed }
    void params
    throw new NotImplementedError('TxSigner.sendTx')
  }
}

// ============================================================================
// RealGasEstimator — D23 填入 eth_estimateGas + eth_gasPrice
// ============================================================================

class RealGasEstimator implements GasEstimator {
  async estimate(params: {
    to: string
    data: string
    from: string
    chainId: number
  }): Promise<{ gasUsed: string; gasPrice: string; cost: string }> {
    // TODO D23: 调用 viem publicClient.estimateGas + getGasPrice
    // const client = getPublicClient(params.chainId)
    // const gas = await client.estimateGas({ to: params.to, data: params.data, from: params.from })
    // const gasPrice = await client.getGasPrice()
    // const cost = (gas * gasPrice) / 1e18 // OKB
    // return { gasUsed: gas.toString(), gasPrice: gasPrice.toString(), cost: cost.toString() }
    void params
    throw new NotImplementedError('GasEstimator.estimate')
  }
}

// ============================================================================
// RealContractCaller — D24 填入 viem contract.write.mint
// ============================================================================

class RealContractCaller implements ContractCaller {
  async mintKc(params: {
    contractAddress: string
    kcSha256: string
    ipfsCid: string
    from: string
    chainId: number
  }): Promise<{ tokenId: number }> {
    // TODO D24: 调用 viem contract.write.mint
    // const walletClient = getWalletClient(params.chainId)
    // const hash = await walletClient.writeContract({
    //   address: params.contractAddress,
    //   abi: registryAbi,
    //   functionName: 'mint',
    //   args: [params.kcSha256, params.ipfsCid],
    // })
    // const receipt = await waitForTxReceipt(hash)
    // const transferEvent = receipt.logs[0]
    // const tokenId = decodeEventLog(transferEvent).args.tokenId
    // return { tokenId: tokenId.toString() }
    void params
    throw new NotImplementedError('ContractCaller.mintKc')
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 获取 real 模式的 OnchainServices
 *
 * 注意：当前所有方法都是 stub，会抛 NotImplementedError
 * D23/D24 填入真实实现后才能使用
 */
export function getRealOnchainServices(): OnchainServices {
  return {
    walletConnector: new RealWalletConnector(),
    nonceProvider: new RealNonceProvider(),
    ipfsUploader: new RealIpfsUploader(),
    txSigner: new RealTxSigner(),
    gasEstimator: new RealGasEstimator(),
    contractCaller: new RealContractCaller(),
  }
}

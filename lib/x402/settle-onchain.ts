/**
 * v2.4.2 — 直接上链结算 (EIP-3009)
 *
 * 绕过 OKX facilitator，直接调用 USDT0 合约的 transferWithAuthorization
 * 把买家签好的 EIP-3009 authorization 提交到 X Layer 链上。
 *
 * 前提：Vercel 环境变量 X402_GAS_PRIVATE_KEY 指向一个 X Layer 上有 OKB 的钱包。
 *       OKB 仅用于 gas，不需要 USDT0。
 */

import { createWalletClient, createPublicClient, http, type Address } from 'viem'
import { xLayer } from 'viem/chains'
import type { PaymentPayload } from './payload'

// USDT0 on X Layer
const USDT0_ADDRESS: Address = '0x779ded0c9e1022225f8e0630b35a9b54be713736'

const USDT0_ABI = [
  {
    name: 'transferWithAuthorization',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const

/** 65-byte ECDSA sig → r, s, v */
function splitSignature(sigHex: string): { r: `0x${string}`; s: `0x${string}`; v: number } {
  const hex = sigHex.startsWith('0x') ? sigHex.slice(2) : sigHex
  if (hex.length !== 130) {
    throw new Error(`invalid signature length: ${hex.length} hex chars, expected 130`)
  }
  let v = parseInt(hex.slice(128, 130), 16)
  if (v >= 27) v -= 27
  return {
    r: `0x${hex.slice(0, 64)}` as `0x${string}`,
    s: `0x${hex.slice(64, 128)}` as `0x${string}`,
    v,
  }
}

export interface SettlementResult {
  success: boolean
  transaction?: string
  errorReason?: string
}

export async function settleOnChain(
  paymentPayload: PaymentPayload,
): Promise<SettlementResult> {
  const privateKey = (process.env.X402_GAS_PRIVATE_KEY || '').trim()
  if (!privateKey) {
    return { success: false, errorReason: 'X402_GAS_PRIVATE_KEY not set' }
  }

  const rpcUrl = process.env.X402_RPC_URL || 'https://rpc.xlayer.tech'
  const auth = paymentPayload.payload.authorization
  const { r, s, v } = splitSignature(paymentPayload.payload.signature)

  const value = BigInt(auth.value)
  const validAfter = BigInt(auth.validAfter)
  const validBefore = BigInt(auth.validBefore)
  const nonce = `0x${Buffer.from(auth.nonce, 'utf-8').toString('hex')}` as `0x${string}`

  try {
    const chain = { ...xLayer, rpcUrls: { default: { http: [rpcUrl] } } }

    const walletClient = createWalletClient({
      chain,
      transport: http(rpcUrl),
      account: privateKey as `0x${string}`,
    })

    const hash = await walletClient.writeContract({
      chain,
      address: USDT0_ADDRESS,
      abi: USDT0_ABI,
      functionName: 'transferWithAuthorization',
      args: [
        auth.from as Address,
        auth.to as Address,
        value,
        validAfter,
        validBefore,
        nonce,
        v,
        r,
        s,
      ] as const,
    })

    const publicClient = createPublicClient({ chain, transport: http(rpcUrl) })
    await publicClient.waitForTransactionReceipt({ hash })

    return { success: true, transaction: hash }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, errorReason: msg }
  }
}

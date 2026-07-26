/**
 * v2.4.2 — 幂等缓存
 *
 * 目的：相同 PAYMENT-SIGNATURE 重复 replay → 直接返回缓存结果，链上不重复扣款。
 *
 * 实现：内存 Map + TTL。Vercel serverless 上每个函数实例独立（弱一致），
 * 冷启动丢失不致命——买家重试会被 facilitator 当作新签名拒绝。
 * v2.5 计划迁 Upstash Redis（持久 + 跨实例）。
 *
 * Key：PAYMENT-SIGNATURE 头原值（base64 字符串）。每个 signature 包含 nonce + validBefore，重复概率极低。
 */

interface Entry {
  body: string
  paymentResponseHeader: string
  expiresAt: number
}

const store = new Map<string, Entry>()

export function getCached(key: string): Entry | null {
  const e = store.get(key)
  if (!e) return null
  if (e.expiresAt < Date.now()) {
    store.delete(key)
    return null
  }
  return e
}

export function setCached(key: string, entry: Omit<Entry, 'expiresAt'>, ttlSec: number): void {
  store.set(key, { ...entry, expiresAt: Date.now() + ttlSec * 1000 })
  // 简单防膨胀：超过 1000 条清掉过期
  if (store.size > 1000) {
    const now = Date.now()
    for (const [k, v] of store) {
      if (v.expiresAt < now) store.delete(k)
    }
  }
}

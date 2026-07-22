/**
 * D42 — 简易 rate limit（P1-8）
 *
 * 不引入 Redis / Upstash 等外部依赖，用内存 Map 实现。
 * Vercel serverless 上每个实例独立计数（弱一致），对 demo 够用：
 * 防止同一 IP 短时间内刷爆 LLM 配额。
 *
 * 限制：
 * - 默认 60s 内最多 10 次调用
 * - 超限返回 429
 *
 * 用法：
 * ```typescript
 * import { checkRateLimit } from '@/lib/rate-limit'
 *
 * const ip = request.headers.get('x-forwarded-for') || 'unknown'
 * const { allowed, remaining, resetAt } = checkRateLimit(`kc:${ip}`)
 * if (!allowed) {
 *   return NextResponse.json(
 *     { error: '请求过于频繁，请稍后再试' },
 *     { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)) } }
 *   )
 * }
 * ```
 */

interface Bucket {
  count: number
  resetAt: number
}

const store = new Map<string, Bucket>()

// 定期清理过期 bucket，避免内存泄漏（每个实例独立）
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    store.forEach((bucket, key) => {
      if (bucket.resetAt < now) {
        store.delete(key)
      }
    })
  }, 60_000).unref?.()
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  limit: number
}

export function checkRateLimit(
  key: string,
  options?: { limit?: number; windowMs?: number }
): RateLimitResult {
  const limit = options?.limit ?? 10
  const windowMs = options?.windowMs ?? 60_000

  const now = Date.now()
  const existing = store.get(key)

  if (!existing || existing.resetAt < now) {
    // 新窗口
    const resetAt = now + windowMs
    store.set(key, { count: 1, resetAt })
    return { allowed: true, remaining: limit - 1, resetAt, limit }
  }

  // 已有窗口
  existing.count++
  const remaining = Math.max(0, limit - existing.count)
  const allowed = existing.count <= limit
  return { allowed, remaining, resetAt: existing.resetAt, limit }
}

/**
 * 从 NextRequest 提取客户端 IP
 * Vercel 会注入 x-forwarded-for，本地开发用 x-real-ip 或 fallback 'unknown'
 */
export function getClientIp(request: { headers: { get: (n: string) => string | null } }): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

/**
 * D42 — 共享 CORS 工具
 *
 * P1-5 修复：所有 API 路由的 OPTIONS handler 之前都写死 `Access-Control-Allow-Origin: '*'`，
 * 任意网站都能跨域调我们的 LLM 端点（消耗我们的 API 配额）。
 *
 * 策略：
 * - 默认 same-origin（不发 ACAO header）— 浏览器同源策略天然保护
 * - 通过环境变量 CORS_ALLOW_ORIGINS 配置白名单（逗号分隔）
 * - 开发环境（NODE_ENV !== 'production'）允许 localhost:* —— 方便本地联调
 * - Vercel preview 部署自动允许 *.vercel.app
 *
 * 用法：
 * ```typescript
 * import { corsHeaders, handleOptions } from '@/lib/cors'
 *
 * export async function OPTIONS() {
 *   return handleOptions()
 * }
 *
 * // 或在响应中附加：
 * return NextResponse.json(data, { headers: corsHeaders() })
 * ```
 */

import type { NextRequest } from 'next/server'

function parseAllowedOrigins(): string[] {
  const raw = process.env.CORS_ALLOW_ORIGINS || ''
  const list = raw
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
  return list
}

function isDev(): boolean {
  return process.env.NODE_ENV !== 'production'
}

function isVercelPreview(url: string): boolean {
  // *.vercel.app 预览部署
  return /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(url)
}

function isLocalhost(url: string): boolean {
  return /^https?:\/\/localhost(:\d+)?$/i.test(url) ||
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/i.test(url)
}

/**
 * 给定请求的 Origin header，决定是否允许跨域，返回对应的 ACAO 值
 * - 返回 undefined → 不附加 CORS headers（同源请求，浏览器不需要）
 * - 返回具体 origin string → 作为 ACAO 值
 */
export function resolveAllowedOrigin(originHeader: string | null): string | undefined {
  if (!originHeader) return undefined // 同源请求或非浏览器

  // 1. 白名单
  const whitelist = parseAllowedOrigins()
  if (whitelist.includes(originHeader)) {
    return originHeader
  }

  // 2. 开发环境允许 localhost
  if (isDev() && isLocalhost(originHeader)) {
    return originHeader
  }

  // 3. Vercel preview 部署
  if (isVercelPreview(originHeader)) {
    return originHeader
  }

  // 4. 拒绝
  return undefined
}

/**
 * 生成 CORS headers（根据请求 Origin 决定是否允许）
 * 同源请求返回空对象（不附加任何 CORS header）
 */
export function corsHeaders(request?: Request | NextRequest): Record<string, string> {
  const origin = request?.headers.get('origin') || null
  const allowed = resolveAllowedOrigin(origin)

  if (!allowed) return {}

  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400', // 24h 缓存 preflight
    'Vary': 'Origin', // 关键：让 CDN/代理按 Origin 缓存不同版本
  }
}

/**
 * Next.js App Router 的 OPTIONS handler
 * 直接 `export async function OPTIONS() { return handleOptions(request) }`
 */
export function handleOptions(request?: Request | NextRequest): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request),
  })
}


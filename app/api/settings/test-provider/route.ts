/**
 * Test Provider Connection — D3 Settings UI 配套
 *
 * POST /api/settings/test-provider
 *
 * 用户在 Settings 页点"测试连接"按钮时调用
 * 接收一个 ProviderConfig（baseURL/apiKey/model），不持久化，只测一次 healthCheck
 *
 * 返回：
 * - 200 { success: true, message: '...', durationMs: 1234, model: '...' }
 * - 200 { success: false, error: '...' }  — 测试失败也算 200，前端按 success 字段判断
 * - 400 { error: '配置无效' }  — 入参校验失败
 *
 * v2.3.2 安全加固（H2）：
 * - baseURL 加 SSRF 校验（拒绝内网 / 保留 IP / 元数据地址）
 * - 复用 parser.ts 的 isPrivateHost 逻辑
 */

import { NextRequest, NextResponse } from 'next/server'
import { ProviderFactory, type ProviderConfig } from '@/core/llm/provider'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * v2.3.2 (H2) — SSRF 校验：拒绝内网 / 保留 IP
 * 复用 lib/parser.ts 的 isPrivateHost 逻辑
 */
function validateBaseURL(baseURL: string): void {
  let parsed: URL
  try {
    parsed = new URL(baseURL)
  } catch {
    throw new Error(`Invalid baseURL: ${baseURL}`)
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`不支持的协议：${parsed.protocol}（仅允许 http/https）`)
  }
  const hostname = parsed.hostname.toLowerCase()
  const isPrivate =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^169\.254\./.test(hostname) ||  // 链路本地（云元数据 169.254.169.254）
    /^fc00:|^fd/.test(hostname) ||   // IPv6 unique local
    /^fe80:/.test(hostname)          // IPv6 link-local
  if (isPrivate) {
    throw new Error(`拒绝连接内网地址：${hostname}（防止 SSRF）`)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Partial<ProviderConfig>

    // 入参校验
    const { type, baseURL, apiKey, model } = body
    if (!baseURL || !apiKey || !model) {
      return NextResponse.json(
        { success: false, error: '配置无效：缺少 baseURL / apiKey / model' },
        { status: 400 }
      )
    }

    // v2.3.2 (H2) — SSRF 校验
    try {
      validateBaseURL(baseURL.trim())
    } catch (ssrfErr) {
      return NextResponse.json(
        { success: false, error: ssrfErr instanceof Error ? ssrfErr.message : 'baseURL 校验失败' },
        { status: 400 }
      )
    }

    const config: ProviderConfig = {
      type: type || 'custom',
      baseURL: baseURL.trim(),
      apiKey: apiKey.trim(),
      model: model.trim(),
      // 测试用较短超时
      timeout: 15_000,
      ...(body.defaultTemperature !== undefined && { defaultTemperature: body.defaultTemperature }),
      ...(body.defaultMaxTokens !== undefined && { defaultMaxTokens: body.defaultMaxTokens }),
    }

    // 用 ProviderFactory.create 显式构造（不读 cookie / env）
    const provider = ProviderFactory.create(config)
    if (!provider.healthCheck) {
      return NextResponse.json({
        success: false,
        error: `Provider ${provider.displayName} 不支持 healthCheck`,
      })
    }
    const ok = await provider.healthCheck()

    if (ok) {
      return NextResponse.json({
        success: true,
        message: `连接成功 — ${provider.displayName} / ${config.model}`,
        provider: provider.displayName,
        model: config.model,
      })
    } else {
      return NextResponse.json({
        success: false,
        error: `连接失败 — Provider 没有返回有效响应，请检查 API Key 和 Base URL`,
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({
      success: false,
      error: `测试连接出错：${message}`,
    })
  }
}

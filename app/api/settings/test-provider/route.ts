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
 */

import { NextRequest, NextResponse } from 'next/server'
import { ProviderFactory, type ProviderConfig } from '@/core/llm/provider'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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

/**
 * Prompt Playground API — D14
 *
 * POST /api/research/playground
 * Body: {
 *   systemPrompt: string,                    // 用户自定义 system prompt
 *   userPrompt: string,                      // 用户自定义 user prompt
 *   temperature?: number,                   // 0-2，默认 0.7
 *   maxTokens?: number,                      // 默认 1024
 *   responseFormat?: 'text' | 'json_object',// 默认 'text'
 * }
 * Response: {
 *   success: true,
 *   content: string,
 *   model: string,
 *   usage: ChatUsage,
 *   durationMs: number,
 *   params: { temperature, maxTokens, responseFormat },
 * }
 *
 * 设计：
 * - 不注入 KC 上下文（纯 prompt 测试）
 * - 不走 coordinator
 * - 单次 LLM 调用
 * - 限制 maxTokens ≤ 2048 防止成本爆炸
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerProvider } from '@/lib/server-provider'
import { setCurrentAgent } from '@/lib/usage-collector'
import type { ChatMessage } from '@/core/llm/provider'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_TOKENS_LIMIT = 2048
const MAX_PROMPT_LENGTH = 8000

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await req.json()
    const {
      systemPrompt,
      userPrompt,
      temperature = 0.7,
      maxTokens = 1024,
      responseFormat = 'text',
    } = body

    // 参数校验
    if (!systemPrompt || typeof systemPrompt !== 'string') {
      return NextResponse.json(
        { success: false, error: '缺少 systemPrompt' },
        { status: 400 }
      )
    }
    if (!userPrompt || typeof userPrompt !== 'string') {
      return NextResponse.json(
        { success: false, error: '缺少 userPrompt' },
        { status: 400 }
      )
    }
    if (systemPrompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json(
        { success: false, error: `systemPrompt 过长（>${MAX_PROMPT_LENGTH} 字符）` },
        { status: 400 }
      )
    }
    if (userPrompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json(
        { success: false, error: `userPrompt 过长（>${MAX_PROMPT_LENGTH} 字符）` },
        { status: 400 }
      )
    }

    // 数值参数范围校验
    const temp = Math.max(0, Math.min(2, Number(temperature) || 0.7))
    const maxTok = Math.max(100, Math.min(MAX_TOKENS_LIMIT, Number(maxTokens) || 1024))
    const respFmt = responseFormat === 'json_object' ? 'json_object' : 'text'

    setCurrentAgent('Playground')

    const provider = getServerProvider()

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]

    const response = await provider.chat(messages, {
      temperature: temp,
      maxTokens: maxTok,
      responseFormat: respFmt,
      timeout: 45_000,
    })

    if (!response.content) {
      return NextResponse.json(
        { success: false, error: 'LLM 返回空内容' },
        { status: 502 }
      )
    }

    return NextResponse.json({
      success: true,
      content: response.content,
      model: response.model,
      usage: response.usage,
      durationMs: Date.now() - startTime,
      params: {
        temperature: temp,
        maxTokens: maxTok,
        responseFormat: respFmt,
      },
    })
  } catch (err) {
    console.error('[playground] error:', err)
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Internal server error',
      },
      { status: 500 }
    )
  }
}

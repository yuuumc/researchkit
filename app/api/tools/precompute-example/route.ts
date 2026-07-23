/**
 * v2.3.3 (C) — Precompute Example Cache
 *
 * POST /api/tools/precompute-example
 *
 * 用 EXAMPLE_FIXTURE.content 跑一次完整流水线（coordinate），
 * 录制 stage 时间线 + agent_token 流，把 SSE 'result' payload
 * 写入 fixtures/example-cache/<hash>.json。
 *
 * 触发方式（任选其一）：
 *  1) npm run precompute-example    （需先 npm run dev）
 *  2) curl -X POST http://localhost:3000/api/tools/precompute-example
 *
 * 前置条件：.env.local 含 OPENAI_API_KEY（或在 Settings UI 配置后带 cookie 调用）。
 *
 * 响应 JSON：
 *  - success: 是否成功
 *  - contentHash: 示例内容 sha256（fixture 文件名）
 *  - fixturePath: 写入的 fixture 路径
 *  - originalDurationMs: 原始 run 总耗时
 *  - perStage: 各 stage 到达时间表（相对首个 stage 的 ms）
 *  - tokenCount: 录制的 agent_token 数
 *  - totalTokens / totalCostUsd: 真实消耗
 *  - 失败时含 error 字段
 *
 * 这是 demo 现场「第一次也是快」的关键：在 dev 服务器跑一次后 commit
 * fixtures/example-cache/<hash>.json，部署即带。
 */

import { NextRequest } from 'next/server'
import { coordinate } from '@/lib/coordinator'
import { EXAMPLE_FIXTURE } from '@/lib/example-content'
import {
  buildExampleCacheKey,
  setExampleCache,
  createRecorder,
  hashExampleContent,
  EXAMPLE_CACHE_VERSION,
  type CachedExample,
} from '@/lib/example-cache'
import { buildResultPayload } from '@/lib/result-payload'
import { getUserConfigFromCookieValue, USER_CONFIG_COOKIE_KEY } from '@/lib/user-config'
import { getServerUserPreferences } from '@/lib/server-user-preferences'
import { detectLocale } from '@/lib/locale'
import * as fs from 'node:fs'
import * as path from 'node:path'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function resolveProviderIdentity(request: NextRequest, content: string) {
  const userConfigCookie = request.cookies.get(USER_CONFIG_COOKIE_KEY)?.value
  const cookieConfig = userConfigCookie
    ? getUserConfigFromCookieValue(userConfigCookie)
    : null
  const model = cookieConfig?.model
    || (process.env.LLM_MODEL || '').trim()
    || 'deepseek-v4-flash'
  const envBaseUrl = (process.env.OPENAI_BASE_URL || '').toLowerCase()
  const providerType = cookieConfig?.type
    || (envBaseUrl.includes('deepseek') ? 'deepseek'
      : envBaseUrl.includes('openai') ? 'openai'
      : envBaseUrl.includes('openrouter') ? 'openrouter'
      : envBaseUrl.includes('groq') ? 'groq'
      : 'custom')
  const detected = detectLocale(content)
  const prefs = getServerUserPreferences()
  const outputLocale = prefs.outputLocale === 'auto' ? detected : prefs.outputLocale
  return {
    model,
    providerType,
    outputLocale,
    preset: prefs.preset,
  }
}

export async function POST(request: NextRequest) {
  const content = EXAMPLE_FIXTURE.content
  const title = EXAMPLE_FIXTURE.title
  const source = EXAMPLE_FIXTURE.source
  const identity = resolveProviderIdentity(request, content)
  const cacheKey = buildExampleCacheKey({ content, ...identity })

  // 检查 API key
  const userConfigCookie = request.cookies.get(USER_CONFIG_COOKIE_KEY)?.value
  const cookieConfig = userConfigCookie
    ? getUserConfigFromCookieValue(userConfigCookie)
    : null
  if (!process.env.OPENAI_API_KEY && !cookieConfig?.apiKey) {
    return Response.json({
      success: false,
      error: 'OPENAI_API_KEY 未设置 — 请在 .env.local 配置或在 Settings UI 填入 API Key 后重试',
      contentHash: cacheKey.contentHash,
    }, { status: 400 })
  }

  // 运行完整流水线（带 Recorder）
  const recorder = createRecorder()
  const pipelineStart = Date.now()
  let result: any
  try {
    result = await coordinate({
      content,
      title,
      source,
      onStage: recorder.wrapOnStage(undefined),
      onAgentToken: recorder.wrapOnAgentToken(undefined),
    })
  } catch (err) {
    return Response.json({
      success: false,
      error: 'Pipeline 调用失败：' + (err instanceof Error ? err.message : String(err)),
      contentHash: cacheKey.contentHash,
      durationMs: Date.now() - pipelineStart,
    }, { status: 500 })
  }
  const pipelineMs = Date.now() - pipelineStart

  // 检查全失败
  const kc = result.knowledgeCard
  const allAgentsFailed = (!kc.title || kc.title === 'Untitled') &&
    (!kc.summary || kc.summary.trim() === '') &&
    (!kc.innovation || kc.innovation.length === 0)
  if (allAgentsFailed) {
    const failedAgents = result.execution
      .filter((e: any) => !e.success)
      .map((e: any) => ({ agent: e.step.agent, error: e.error }))
    return Response.json({
      success: false,
      error: '所有 Agent 调用失败，请检查 API key / 网络 / 模型配置',
      contentHash: cacheKey.contentHash,
      failedAgents,
      durationMs: pipelineMs,
    }, { status: 500 })
  }

  // 构造 SSE 'result' payload（与 live 路径同构）
  const payload = buildResultPayload(result, source)

  // 写 fixture 文件
  const entry: CachedExample = {
    cacheVersion: EXAMPLE_CACHE_VERSION,
    contentHash: cacheKey.contentHash,
    model: cacheKey.model,
    providerType: cacheKey.providerType,
    outputLocale: cacheKey.outputLocale,
    preset: cacheKey.preset,
    createdAt: new Date().toISOString(),
    originalDurationMs: result.totalDurationMs,
    stages: recorder.stages,
    tokenStreams: recorder.tokens,
    result: payload,
  }

  const fixtureDir = path.join(process.cwd(), 'fixtures', 'example-cache')
  const fixturePath = path.join(fixtureDir, `${cacheKey.contentHash}.json`)
  let wroteFixture = false
  let writeError: string | undefined
  try {
    if (!fs.existsSync(fixtureDir)) fs.mkdirSync(fixtureDir, { recursive: true })
    fs.writeFileSync(fixturePath, JSON.stringify(entry), 'utf-8')
    wroteFixture = true
  } catch (err) {
    writeError = err instanceof Error ? err.message : String(err)
  }

  // 也写入运行时缓存（in-memory + runtime dir 持久化）
  setExampleCache(entry)

  // 构造 perStage 时间表（相对首个 stage）
  const perStage = recorder.stages.map((s, i) => ({
    idx: i + 1,
    id: s.id,
    label: s.label,
    detail: s.detail,
    t: s.t,
  }))

  // 控制台打印一份人类可读的时序表
  console.log('═══════════════════════════════════════════════════════')
  console.log(`[precompute-example] contentHash: ${cacheKey.contentHash}`)
  console.log(`[precompute-example] provider: ${cacheKey.providerType} / ${cacheKey.model} / locale=${cacheKey.outputLocale} / preset=${cacheKey.preset}`)
  console.log(`[precompute-example] pipeline total: ${result.totalDurationMs}ms (wall ${pipelineMs}ms)`)
  console.log(`[precompute-example] stages:`)
  for (const s of perStage) {
    console.log(`  t=${String(s.t).padStart(6)}ms  stage ${s.id}  ${s.label}${s.detail ? ' — ' + s.detail : ''}`)
  }
  console.log(`[precompute-example] tokens: ${recorder.tokens.length} (agents: ${[...new Set(recorder.tokens.map(t => t.agent))].join(', ')})`)
  console.log(`[precompute-example] total tokens: ${payload.metadata.total_tokens}  cost: $${payload.metadata.total_cost_usd.toFixed(4)}`)
  console.log(`[precompute-example] fixture: ${wroteFixture ? fixturePath : 'WRITE FAILED: ' + writeError}`)
  console.log('═══════════════════════════════════════════════════════')

  return Response.json({
    success: true,
    contentHash: cacheKey.contentHash,
    fixturePath: wroteFixture ? fixturePath : null,
    wroteFixture,
    writeError,
    originalDurationMs: result.totalDurationMs,
    wallMs: pipelineMs,
    perStage,
    tokenCount: recorder.tokens.length,
    totalTokens: payload.metadata.total_tokens,
    totalCostUsd: payload.metadata.total_cost_usd,
  })
}

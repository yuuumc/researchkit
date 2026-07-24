/**
 * Multi-Agent Research Endpoint (SSE 版本)
 * POST /api/research/multi-agent-stream
 *
 * 用 Server-Sent Events 实时推送进度：
 * 1. coordinator 的 onStage 回调 → 推送 stage 事件
 * 2. coordinator 的 onAgentToken 回调 → 推送 agent_token 事件（D28 token 级流式）
 * 3. coordinator 完成 → 推送 result 事件（完整结果）+ 关闭连接
 *
 * 前端用 EventSource 订阅，进度面板与真实后端执行严格同步；
 * Live Thoughts 浮窗组件接收 agent_token 事件，逐 token 渲染 AI 思考过程
 *
 * v2.3.3 (C) —「载入示例」路径优化：
 *  - 若请求内容命中 EXAMPLE_FIXTURE 且 provider/locale/preset 与缓存一致：
 *    走「演示性回放」分支，把录制好的 stage 时间线 + agent_token 流按节拍重发，
 *    整体 4-7s 完成（典型原始 run 30-90s），对 UI 契约零破坏。
 *  - 否则正常调 coordinate()。若是示例请求但缓存 miss，会同时录制 + 自填充
 *    到内存 + .researchkit-cache/（fs 不可写时静默失败），第二次起命中回放。
 *  - env EXAMPLE_CACHE_DISABLED=1 永远走 live 路径，便于现场对比。
 *  - 保留 v2.3.2 安全加固：maxDuration=60 / 58s Promise.race / H4 stack trace 脱敏。
 *    缓存命中走回放时不需要 58s 保护（回放本身 4-7s，远低于阈值）。
 */

import { NextRequest } from 'next/server'
import { coordinate } from '@/lib/coordinator'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
// D43 — magic numbers 集中到 config/orchestration.ts
import {
  TOKEN_FLUSH_INTERVAL_MS,
  MIN_CONTENT_LENGTH,
  MAX_CONTENT_LENGTH,
  RATE_LIMIT_KC,
} from '@/config/orchestration'
// v2.3.3 (C) — 示例缓存 / 回放
import { getUserConfigFromCookieValue, USER_CONFIG_COOKIE_KEY } from '@/lib/user-config'
import { getServerUserPreferences } from '@/lib/server-user-preferences'
import { detectLocale } from '@/lib/locale'
import {
  buildExampleCacheKey,
  getExampleCache,
  setExampleCache,
  isExampleRequest,
  createRecorder,
  replayExample,
  type CachedExample,
  type ResultPayload,
  type ReplaySink,
} from '@/lib/example-cache'
import { buildResultPayload } from '@/lib/result-payload'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Vercel serverless function timeout — multi-agent pipeline 通常需要 60-90s
// Hobby plan 上限 60s，Pro plan 上限 300s，这里设 60s 兜底（Hobby 用户也能跑完）
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder()

  // P1-8 rate limit（LLM 调用最贵，1 分钟内最多 10 次）
  const ip = getClientIp(request)
  const rl = checkRateLimit(`kc:${ip}`, RATE_LIMIT_KC)
  if (!rl.allowed) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ error: '请求过于频繁，请稍后再试' })}\n\n`,
      {
        status: 429,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      }
    )
  }

  try {
    // D41 诊断增强：先拿 raw text 再手动 JSON.parse
    // 原因：直接 await request.json() 抛错时无法知道实际收到的 body 长什么样
    // （比如 PowerShell curl 发了 {content:"..."} 不是合法 JSON，或被中间层篡改）
    // 手动解析能在错误信息里带上 raw body，便于现场定位
    const rawBody = await request.text()
    let body: { content?: string; title?: string; source?: string }
    try {
      body = JSON.parse(rawBody)
    } catch (parseErr) {
      console.error('[multi-agent-stream] JSON.parse 失败:', {
        bodyLength: rawBody.length,
        bodyPreview: rawBody.substring(0, 500),
        contentType: request.headers.get('content-type'),
        errMessage: parseErr instanceof Error ? parseErr.message : String(parseErr),
      })
      return new Response(
        `event: error\ndata: ${JSON.stringify({
          error: `请求体不是合法 JSON（${parseErr instanceof Error ? parseErr.message : 'parse error'}）。收到的 body 前 200 字符：${rawBody.substring(0, 200)}`,
          debug: {
            contentType: request.headers.get('content-type'),
            bodyLength: rawBody.length,
            bodyPreview: rawBody.substring(0, 200),
          },
        })}\n\n`,
        {
          status: 400,
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
        }
      )
    }
    const content = body.content || ''
    const title = body.title
    const source = body.source || '用户输入'

    if (!content || content.length < MIN_CONTENT_LENGTH) {
      return new Response(
        `event: error\ndata: ${JSON.stringify({ error: `内容过短，请提供至少 ${MIN_CONTENT_LENGTH} 字符` })}\n\n`,
        {
          status: 400,
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
        }
      )
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      return new Response(
        `event: error\ndata: ${JSON.stringify({ error: `内容过长，最大支持 ${MAX_CONTENT_LENGTH} 字符` })}\n\n`,
        {
          status: 400,
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
        }
      )
    }

    // 创建 ReadableStream — SSE 必须用 stream 而不是一次性 response
    const stream = new ReadableStream({
      async start(controller) {
        const send = (eventName: string, data: unknown) => {
          try {
            const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`
            controller.enqueue(encoder.encode(payload))
          } catch (err) {
            console.error('SSE send failed:', err)
          }
        }

        // D19 SSE 首字节优化：立即发送 ping 事件强制 flush 连接
        // 原因：Next.js / Node.js HTTP 可能缓冲响应直到第一个 await 才 flush，
        // 导致客户端等待 Planner 完成（~3s）才收到第一个字节
        // 修复：在 coordinate() 之前发送一个 ping，建立 SSE 连接并 flush 头部
        send('ping', { ts: Date.now() })
        // 让出事件循环，让 HTTP 层把 ping 事件 flush 到网络
        await new Promise(resolve => setTimeout(resolve, 0))

        // D28 — token 流式推送的节流 buffer
        // 原因：每个 delta 都触发 controller.enqueue 在 token 密集时（如代码块）
        // 会导致前端 EventSource 事件循环压力过大，可能掉帧
        // 策略：buffer 累积 delta，每 TOKEN_FLUSH_INTERVAL_MS flush 一次
        // D43 — 常量从 config/orchestration 引入
        let tokenBuffer: { agent: string; delta: string }[] = []
        let flushTimer: NodeJS.Timeout | null = null
        const flushTokenBuffer = () => {
          flushTimer = null
          if (tokenBuffer.length === 0) return
          // 合并同 agent 的 delta，减少 SSE event 数量
          const merged = new Map<string, string>()
          for (const { agent, delta } of tokenBuffer) {
            merged.set(agent, (merged.get(agent) || '') + delta)
          }
          for (const [agent, delta] of Array.from(merged)) {
            send('agent_token', { agent, delta, ts: Date.now() })
          }
          tokenBuffer = []
        }
        const scheduleFlush = () => {
          if (flushTimer === null) {
            flushTimer = setTimeout(flushTokenBuffer, TOKEN_FLUSH_INTERVAL_MS)
          }
        }

        // ============================================================
        // v2.3.3 (C) — 解析当前请求的 cache key（provider + locale + preset）
        // 用于决定走 cache 回放还是 live 路径（仅示例内容会查 cache）
        // ============================================================
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
        const cacheKey = buildExampleCacheKey({
          content,
          model,
          providerType,
          outputLocale,
          preset: prefs.preset,
        })
        const cached = getExampleCache(cacheKey)
        // 若是示例请求但缓存 miss，live 路径要同时录制用于自填充
        const shouldRecord = !cached && isExampleRequest(content)

        // 构造 abort-aware sleep（让 replay 在客户端断开时立即退出）
        const abortableSleep = (ms: number): Promise<void> => {
          if (request.signal.aborted) return Promise.resolve()
          return new Promise<void>((resolve) => {
            const t = setTimeout(() => {
              request.signal.removeEventListener('abort', onAbort)
              resolve()
            }, ms)
            const onAbort = () => {
              clearTimeout(t)
              resolve()
            }
            request.signal.addEventListener('abort', onAbort, { once: true })
          })
        }

        try {
          if (cached) {
            // ============================================================
            // v2.3.3 (C) — 缓存命中：演示性回放（不需要 58s 保护，回放 4-7s）
            // ============================================================
            const sink: ReplaySink = {
              sendStage: (s) => send('stage', s),
              pushToken: (agent, delta) => {
                tokenBuffer.push({ agent, delta })
                scheduleFlush()
              },
              flushTokens: () => {
                if (flushTimer !== null) {
                  clearTimeout(flushTimer)
                  flushTimer = null
                }
                flushTokenBuffer()
              },
              isAborted: () => request.signal.aborted,
              sleep: abortableSleep,
            }
            await replayExample(cached, sink)
            if (request.signal.aborted) return

            // 发送 result（不修改原 cached.result，浅拷贝 metadata 追加回放标记）
            const replayedMetadata = (cached.result && cached.result.metadata) || {}
            const replayPayload: ResultPayload = {
              ...(cached.result || {}),
              metadata: {
                ...replayedMetadata,
                example_replay: {
                  cacheHit: true,
                  originalDurationMs: cached.originalDurationMs,
                  cacheCreatedAt: cached.createdAt,
                },
              },
            }
            send('result', replayPayload)

            // 最终阶段：Done
            send('stage', { id: 7, label: 'Done' })
            return
          }

          // ============================================================
          // Live 路径（无缓存或非示例请求）
          // 保留 v2.3.2 安全加固：58s Promise.race + allAgentsFailed 诊断
          // 若是示例但缓存 miss → 同步录制，用于自填充
          // ============================================================
          const recorder = shouldRecord ? createRecorder() : null
          const onStage = recorder
            ? recorder.wrapOnStage((s) => send('stage', s))
            : (s: any) => send('stage', s)
          const onAgentToken = recorder
            ? recorder.wrapOnAgentToken((agent: string, delta: string) => {
                tokenBuffer.push({ agent, delta })
                scheduleFlush()
              })
            : (agent: string, delta: string) => {
                tokenBuffer.push({ agent, delta })
                scheduleFlush()
              }

          // Vercel 超时保护：58s 内未完成则主动发 error 事件
          // Vercel function 60s hard kill，留 2s 给 flush + close
          // v2.3.3 fix — 仅 Vercel 环境启用 58s 超时;本地 dev 不受 Vercel hard kill 约束,放宽到 5 分钟
          // 之前硬编码 58_000 导致本地 dev 也被 Promise.race 提前打断,误以为"也有 58 秒限制"
          const isVercelEnv = Boolean(process.env.VERCEL)
          const PIPELINE_TIMEOUT_MS = isVercelEnv ? 58_000 : 300_000
          let pipelineTimedOut = false
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
              pipelineTimedOut = true
              reject(new Error('TIMEOUT'))
            }, PIPELINE_TIMEOUT_MS)
          })

          const result = await Promise.race([
            coordinate({
              content,
              title,
              source,
              // v2.3.3 fix: 把已解析的 outputLocale 传给 coordinator
              // outputLocale 在 L197 已解析为具体 locale（'auto' → detected）
              outputLocale: outputLocale as any,
              onStage,
              onAgentToken,
            }),
            timeoutPromise,
          ])

          // ===== 完整性检查：检测所有 Agent 是否全部失败 =====
          // 如果 KB.title 是 Untitled 且 summary 为空 且 innovation 为空数组，
          // 说明 Reader/Analyzer/Terminology 全部失败（LLM 调用出错）
          const kc = result.knowledgeCard
          console.log('[multi-agent-stream] KB summary:', {
            title: kc.title,
            hasSummary: !!kc.summary,
            innovationCount: (kc.innovation || []).length,
            authorsCount: (kc.authors || []).length,
            field: kc.field,
            executionSuccessCount: result.execution.filter(e => e.success).length,
            executionTotalCount: result.execution.length,
            failedAgents: result.execution.filter(e => !e.success).map(e => e.step.agent),
          })

          const allAgentsFailed =
            (!kc.title || kc.title === 'Untitled') &&
            (!kc.summary || kc.summary.trim() === '') &&
            (!kc.innovation || kc.innovation.length === 0) &&
            (!kc.research_goals || kc.research_goals.length === 0)

          if (allAgentsFailed) {
            // 找到具体哪个 Agent 失败了，便于诊断
            const failedAgents = result.execution
              .filter(e => !e.success)
              .map(e => ({
                agent: e.step.agent,
                error: e.error || 'Unknown error',
              }))

            // 诊断 1：如果 execution 列表里只有 KB + Export（说明 Planner 返回了空 plan，
            // 直接走了"自动追加 KB/Export"分支，根本没调用 Reader/Analyzer/Terminology）
            const executedAgentNames = new Set(result.execution.map(e => e.step.agent))
            const coreAgentsMissing = !executedAgentNames.has('Reader') &&
              !executedAgentNames.has('Analyzer') &&
              !executedAgentNames.has('Terminology')

            let errorMsg: string
            if (failedAgents.length > 0) {
              errorMsg = `所有 Agent 调用失败：${failedAgents.map(f => `${f.agent}(${f.error.substring(0, 80)})`).join(', ')}。请检查 .env.local 中的 OPENAI_API_KEY、OPENAI_BASE_URL、LLM_MODEL 配置。`
            } else if (coreAgentsMissing) {
              // Planner 返回空 plan，没调用任何核心 Agent
              errorMsg = `Planner 未生成有效执行计划（核心 Agent 未被调用）。可能原因：LLM 限流、API key 无效、或网络中断。请检查 .env.local 中的 OPENAI_API_KEY、OPENAI_BASE_URL、LLM_MODEL 配置，稍后重试。`
            } else {
              errorMsg = '所有 Agent 调用失败，请检查 API key 和网络连接。'
            }

            console.error('All agents failed:', {
              failedAgents,
              executedAgents: Array.from(executedAgentNames),
              coreAgentsMissing,
              plannerDuration: result.plannerDurationMs,
              totalDuration: result.totalDurationMs,
              planRationale: result.plan.rationale,
            })

            send('error', { error: errorMsg })
            return  // 不调用 controller.close()，由 finally 统一关闭，避免双重 close 抛 TypeError
          }

          // 推送最终结果（v2.3.3 改用共享 buildResultPayload，与 precompute 缓存字段同构）
          const payload = buildResultPayload(result, source)
          send('result', payload)

          // v2.3.3 (C) — 若是示例请求且本次为 live 路径，持久化到三层缓存
          // 下一次同 provider/locale 命中即走回放
          if (recorder) {
            const entry: CachedExample = {
              cacheVersion: 1,
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
            setExampleCache(entry)
          }

          // 最终阶段：Done
          send('stage', { id: 7, label: 'Done' })
        } catch (err) {
          // 超时保护：58s 内未完成，发友好错误消息
          if (err instanceof Error && err.message === 'TIMEOUT') {
            console.error('[multi-agent-stream] Pipeline 超时（58s），可能因输入过长或 LLM 响应慢')
            send('error', {
              error: '生成超时：pipeline 在 58 秒内未完成。请缩短输入内容后重试，或稍后再试。',
            })
          } else {
            send('error', { error: err instanceof Error ? err.message : '服务器内部错误' })
          }
        } finally {
          // D28 — 流结束前 flush 残留 token，避免最后一批 delta 丢失
          if (flushTimer !== null) {
            clearTimeout(flushTimer)
            flushTimer = null
          }
          flushTokenBuffer()
          // 用 try/catch 保护 close()，避免流已关闭时抛 TypeError（allAgentsFailed 提前 return 的场景）
          try { controller.close() } catch {}
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // nginx 不缓冲
        // B4 — 显式声明 chunked，避免某些代理/CDN 缓冲整个响应
        'Transfer-Encoding': 'chunked',
      },
    })
  } catch (error) {
    console.error('SSE endpoint 错误:', error)
    const errMsg = error instanceof Error ? error.message : String(error)
    // v2.3.2 (H4) — 生产环境不返回 stack trace，避免信息泄露
    const isProd = process.env.NODE_ENV === 'production'
    return new Response(
      `event: error\ndata: ${JSON.stringify({
        error: isProd ? '服务器内部错误' : `服务器内部错误：${errMsg}`,
        ...(isProd ? {} : {
          debug: {
            name: error instanceof Error ? error.name : 'Unknown',
            stack: error instanceof Error ? error.stack?.substring(0, 500) : undefined,
          },
        }),
      })}\n\n`,
      {
        status: 500,
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
      }
    )
  }
}

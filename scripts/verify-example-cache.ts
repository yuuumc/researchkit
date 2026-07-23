/**
 * v2.3.3 (C) — Standalone harness: 测量示例缓存回放引擎的真实 wall time
 *
 * 不依赖 LLM / API key / Next server。合成一个 realistic CachedExample
 * （模拟一次 ~40s 真实 run 的 stage 时间线 + agent_token 流），调
 * replayExample() 用真实 setTimeout pacing 跑完，输出总耗时与各 stage 到达时间。
 *
 * 用途：
 *  - 验证回放引擎在当前部署环境的真实耗时（无 LLM 噪声）
 *  - 对比不同 TIME_SCALE 取值下的体感
 *  - 集成测试可加进 CI（纯 Node，零网络依赖）
 *
 * 运行：npm run verify:example-cache
 *
 * 测量的是回放代码路径本身的 wall time（节拍 + setTimeout 精度），
 * 不是真实 LLM 耗时。原始 LLM 耗时数字必须由用户在真实环境用
 * `npm run precompute-example` 测量（脚本会打印 originalDurationMs）。
 */

import { EXAMPLE_FIXTURE } from '../lib/example-content'
import {
  replayExample,
  type CachedExample,
  type RecordedStage,
  type RecordedToken,
} from '../lib/example-cache'
import {
  EXAMPLE_REPLAY_TIME_SCALE,
  EXAMPLE_REPLAY_MIN_EVENT_GAP_MS,
  EXAMPLE_REPLAY_MAX_EVENT_GAP_MS,
  EXAMPLE_REPLAY_STAGE_MIN_DWELL_MS,
  EXAMPLE_REPLAY_TAIL_MS,
} from '../config/orchestration'

// ---------------------------------------------------------------------------
// 合成 realistic timeline（模拟一次 40s 真实 run）
// - Planner ~3s：1 个 JSON-mode 流式调用
// - Trio 并行 ~15s：Reader 12s / Analyzer 10s / Terminology 8s（最大者主导）
// - KB 瞬时（无 LLM）
// - Recommendation intent LLM ~3s + arXiv/S2 搜索 ~5s + reason LLM ~3s = 11s
// - Export 瞬时
// - Reflect ~5s，若不满足 +Replan ~3s + supp ~5s + Reflect#2 ~4s ≈ 12s
// 合计约 40s，与真实 v2.3.1 deepseek-v4-flash 实测一致
// ---------------------------------------------------------------------------
function buildSyntheticEntry(): CachedExample {
  const stages: RecordedStage[] = [
    { t: 0,      id: 1, label: 'Document Loaded' },
    { t: 3000,   id: 2, label: 'Plan Generated', detail: 'complexity=medium, steps=6' },
    { t: 5000,   id: 3, label: 'Concepts Extracted', detail: 'Reader + Analyzer + Terminology 并行分析' },
    { t: 20000,  id: 4, label: 'Knowledge Card Built' },
    { t: 20001,  id: 5, label: 'Reflection Loop', detail: 'iteration 1/2' },
    { t: 35000,  id: 6, label: 'Exports Ready', detail: '生成 Markdown / Obsidian / Mindmap' },
    { t: 40000,  id: 7, label: 'Done' },
  ]

  const tokens: RecordedToken[] = []
  // Planner token 流：t=0-3000，约 30 段（每段 25-35 字符）
  const plannerText =
    'Analyzing the Transformer paper abstract. Step 1: identify input_type as paper. ' +
    'Step 2: select Reader, Analyzer, Terminology in parallel_group 1. ' +
    'Step 3: required_schema includes innovation, methodology, results, datasets. ' +
    'Step 4: add KnowledgeBuilder in group 2. ' +
    'Step 5: add Recommendation in group 3 (academic paper). ' +
    'Step 6: add Export in group 4. Plan complete.'
  const plannerSegments = chunkText(plannerText, 28)
  for (let i = 0; i < plannerSegments.length; i++) {
    const t = Math.round((i / plannerSegments.length) * 2900)
    tokens.push({ t, agent: 'Planner', delta: plannerSegments[i] })
  }
  // Reflection token 流：t=20000-25000，约 15 段
  const reflText =
    'Reviewing the knowledge card. Completeness looks high — title, summary, takeaway, ' +
    'methodology, experiments, results, limitations are all filled. ' +
    'Confidence is medium-high — results contain specific BLEU numbers. ' +
    'Satisfied. No supplementary steps needed.'
  const reflSegments = chunkText(reflText, 35)
  for (let i = 0; i < reflSegments.length; i++) {
    const t = 20000 + Math.round((i / reflSegments.length) * 4900)
    tokens.push({ t, agent: 'Reflection', delta: reflSegments[i] })
  }

  const result = {
    success: true,
    knowledge_card: {
      title: EXAMPLE_FIXTURE.title,
      summary: '[synthetic] The Transformer replaces recurrence with self-attention.',
      evaluation: { completeness: 85, confidence: 78, evidence: 'Strong' },
    },
    metadata: {
      total_duration_ms: 40000,
      total_tokens: 12000,
      total_cost_usd: 0.0024,
    },
  } as any

  return {
    cacheVersion: 1,
    contentHash: 'synthetic',
    model: 'synthetic',
    providerType: 'synthetic',
    outputLocale: 'en-US',
    preset: 'academic',
    createdAt: new Date().toISOString(),
    originalDurationMs: 40000,
    stages,
    tokenStreams: tokens,
    result,
  }
}

function chunkText(text: string, size: number): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size))
  return out
}

async function main() {
  const entry = buildSyntheticEntry()
  console.log('[verify] synthetic entry:', {
    stages: entry.stages.length,
    tokens: entry.tokenStreams.length,
    agents: Array.from(new Set(entry.tokenStreams.map((t) => t.agent))),
    originalDurationMs: entry.originalDurationMs,
  })
  console.log('[verify] replay pacing options:', {
    timeScale: EXAMPLE_REPLAY_TIME_SCALE,
    minEventGapMs: EXAMPLE_REPLAY_MIN_EVENT_GAP_MS,
    maxEventGapMs: EXAMPLE_REPLAY_MAX_EVENT_GAP_MS,
    stageMinDwellMs: EXAMPLE_REPLAY_STAGE_MIN_DWELL_MS,
    tailMs: EXAMPLE_REPLAY_TAIL_MS,
  })

  const stageArrivals: { id: number; label: string; t: number; gapFromPrev: number }[] = []
  const tokenCountByAgent = new Map<string, number>()

  const sink = {
    sendStage(s: { id: number; label: string; detail?: string }) {
      const t = Date.now() - startMs
      const prev = stageArrivals[stageArrivals.length - 1]
      const gapFromPrev = prev ? t - prev.t : 0
      stageArrivals.push({ id: s.id, label: s.label, t, gapFromPrev })
      console.log(`  [stage ${s.id}] t=${String(t).padStart(5)}ms  gap=${String(gapFromPrev).padStart(4)}ms  ${s.label}${s.detail ? ' — ' + s.detail : ''}`)
    },
    pushToken(agent: string, _delta: string) {
      tokenCountByAgent.set(agent, (tokenCountByAgent.get(agent) || 0) + 1)
    },
    flushTokens() {
      // no-op for verify（不打每个 token 的 wall time）
    },
    isAborted() {
      return false
    },
    sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  }

  const startMs = Date.now()
  await replayExample(entry, sink)
  const totalMs = Date.now() - startMs

  console.log('')
  console.log('[verify] ============ 测量结果 ============')
  console.log(`[verify] 回放总耗时: ${totalMs}ms (${(totalMs / 1000).toFixed(2)}s)`)
  console.log(`[verify] 原始模拟 run: ${entry.originalDurationMs}ms (${(entry.originalDurationMs / 1000).toFixed(2)}s)`)
  console.log(`[verify] 实际缩放比: ${(totalMs / entry.originalDurationMs).toFixed(3)} (配置: ${EXAMPLE_REPLAY_TIME_SCALE})`)
  console.log(`[verify] 各 stage 到达时间 / 与上一 stage 间隔：`)
  for (const s of stageArrivals) {
    console.log(`  stage ${s.id} (${s.label.padEnd(20)}): t=${String(s.t).padStart(5)}ms  gap=${String(s.gapFromPrev).padStart(4)}ms`)
  }
  console.log(`[verify] 推送给 sink 的 token 数（按 agent）：`)
  for (const [agent, n] of tokenCountByAgent.entries()) {
    console.log(`  ${agent}: ${n}`)
  }

  // 简单的"合理性"断言（不严格，让用户看到数字）
  const expectedMaxMs = Math.round(entry.originalDurationMs * EXAMPLE_REPLAY_TIME_SCALE) + 2000
  const ok = totalMs > 2000 && totalMs < expectedMaxMs * 1.5
  console.log('')
  console.log(`[verify] 合理性: ${ok ? '✅ PASS' : '⚠️ 异常'} (期望 2-15s 范围)`)

  process.exit(ok ? 0 : 1)
}

main().catch((err) => {
  console.error('[verify] 未捕获错误:', err)
  process.exit(2)
})

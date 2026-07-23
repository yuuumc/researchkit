/**
 * v2.3.3 (C) — 示例结果预计算缓存 + 运行时自填充 + 回放引擎
 *
 * 背景：
 * 「载入示例」是 hackathon 评委最常点击的按钮，触发完整 7-stage 流水线。
 * 实测 stage 3（Concepts Extracted）最长占 60-80% 总耗时，因为 executePlan
 * 在 group 1 并行跑 Reader(30K) + Analyzer(20K) + Terminology(20K) 三次 LLM
 * 调用、Recommendation 还要再串行 2 次 LLM + 最多 12 次外部 HTTP 搜索
 * （arXiv + SemanticScholar，均无超时），全栈总耗时通常 30-90s。
 *
 * 优化策略（按预期收益排序，本文件实现 1 + 3）：
 *  1) 示例内容固定 → 预计算 + 缓存 + 演示性回放（直接消灭 stage 3 等待）
 *  3) 边界防御：避免回放时对 UI 契约做任何破坏
 *
 * 三层缓存（命中即返回）：
 *  1) 进程内 Map（热路径，零 IO；同实例重复点击零延迟）
 *  2) 仓库 fixtures/example-cache/<hash>.json（部署即带，Vercel 也能命中）
 *  3) 运行时 .researchkit-cache/<hash>.json（dev / 自托管；Vercel 只读 fs 静默失败）
 *
 * 关闭：env EXAMPLE_CACHE_DISABLED=1 → 永远走 live 路径，便于现场对比。
 *
 * Cache key（严格）：sha256(normalize(content)) + providerType + model + outputLocale + preset
 * - 任一不一致 → miss（避免错语言/错模型的输出被误用）
 * - 仅当 content 命中 EXAMPLE_FIXTURE 时才查缓存（其他输入永不命中，永不录制）
 *
 * 对外契约：
 * - SSE event 形状不变；仅 metadata 追加 example_replay 字段（additive）
 * - 7 个 stage 事件照常发射，agent_token 流照常推送（用相同 30ms 节流 buffer）
 * - 输出质量零损失（缓存的就是真实 LLM 输出；replay 只是改变发出时机）
 */

import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { normalizeExampleContent, EXAMPLE_FIXTURE } from './example-content'

// ============================================================================
// 常量
// ============================================================================

/** 缓存结构版本（不兼容时 +1，命中时若版本不符会拒绝并 miss） */
export const EXAMPLE_CACHE_VERSION = 1

/** 进程内热缓存（按 cacheKeyString 索引） */
const memoryCache = new Map<string, CachedExample>()

function isDisabled(): boolean {
  const v = process.env.EXAMPLE_CACHE_DISABLED
  return v === '1' || v === 'true'
}

// ============================================================================
// 类型
// ============================================================================

/** 录制到的单个 stage 事件（t = 距首个 stage 的毫秒） */
export interface RecordedStage {
  t: number
  id: 1 | 2 | 3 | 4 | 5 | 6 | 7
  label: string
  detail?: string
}

/** 录制到的单个 agent_token 事件 */
export interface RecordedToken {
  t: number
  agent: string
  delta: string
}

/** 缓存条目（result 与 SSE 'result' 事件的 payload 同构） */
export type ResultPayload = Record<string, any>

export interface CachedExample {
  cacheVersion: number
  contentHash: string
  model: string
  providerType: string
  outputLocale: string
  preset: string
  createdAt: string
  /** 原始 run 总耗时（ms）— 回放时附加到 metadata 供 demo 对比 */
  originalDurationMs: number
  stages: RecordedStage[]
  tokenStreams: RecordedToken[]
  /** 与 SSE 'result' 事件 payload 同构（knowledge_card / recommendations / ...） */
  result: ResultPayload
}

export interface ExampleCacheKey {
  contentHash: string
  model: string
  providerType: string
  outputLocale: string
  preset: string
}

// ============================================================================
// Key 构造
// ============================================================================

/** 规范化输入 → SHA-256 */
export function hashExampleContent(content: string): string {
  return crypto.createHash('sha256').update(normalizeExampleContent(content)).digest('hex')
}

function safeStr(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback
}

export function buildExampleCacheKey(input: {
  content: string
  model: string
  providerType: string
  outputLocale: string
  preset: string
}): ExampleCacheKey {
  return {
    contentHash: hashExampleContent(input.content),
    model: safeStr(input.model, 'deepseek-v4-flash'),
    providerType: safeStr(input.providerType, 'deepseek'),
    outputLocale: safeStr(input.outputLocale, 'en-US'),
    preset: safeStr(input.preset, 'academic'),
  }
}

export function cacheKeyString(k: ExampleCacheKey): string {
  return `${k.contentHash.slice(0, 16)}|${k.providerType}|${k.model}|${k.outputLocale}|${k.preset}`
}

// ============================================================================
// 路径
// ============================================================================

function fixtureDir(): string {
  return path.join(process.cwd(), 'fixtures', 'example-cache')
}

function runtimeDir(): string {
  return path.join(process.cwd(), '.researchkit-cache', 'example')
}

// ============================================================================
// 读取
// ============================================================================

function readFromDisk(filePath: string): CachedExample | null {
  try {
    if (!fs.existsSync(filePath)) return null
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as CachedExample
    if (!parsed || parsed.cacheVersion !== EXAMPLE_CACHE_VERSION) {
      console.warn(`[example-cache] ${path.basename(filePath)} version mismatch, ignored`)
      return null
    }
    if (!Array.isArray(parsed.stages) || !parsed.result) {
      console.warn(`[example-cache] ${path.basename(filePath)} malformed, ignored`)
      return null
    }
    return parsed
  } catch (err) {
    console.warn(`[example-cache] read failed for ${filePath}:`, err instanceof Error ? err.message : err)
    return null
  }
}

function findByContentHash(targetHash: string): CachedExample | null {
  // 1) 进程内（遍历 — 通常极小）
  for (const entry of memoryCache.values()) {
    if (entry.contentHash === targetHash) return entry
  }
  // 2) 仓库 fixture 目录（精确文件）
  try {
    if (fs.existsSync(fixtureDir())) {
      const got = readFromDisk(path.join(fixtureDir(), `${targetHash}.json`))
      if (got) return got
    }
  } catch {
    // read-only fs (Vercel) — 静默降级
  }
  // 3) 运行时目录
  try {
    if (fs.existsSync(runtimeDir())) {
      const got = readFromDisk(path.join(runtimeDir(), `${targetHash}.json`))
      if (got) return got
    }
  } catch {
    // ignore
  }
  return null
}

function toKey(c: CachedExample): ExampleCacheKey {
  return {
    contentHash: c.contentHash,
    model: c.model,
    providerType: c.providerType,
    outputLocale: c.outputLocale,
    preset: c.preset,
  }
}

/**
 * 查找示例缓存。命中条件：
 *  - 当前请求内容 hash 必须等于 EXAMPLE_FIXTURE.content 的 hash（不是示例 → 永不命中）
 *  - 找到的条目 (model, providerType, outputLocale, preset) 全部一致
 */
export function getExampleCache(key: ExampleCacheKey): CachedExample | null {
  if (isDisabled()) return null
  // 严格门控：仅示例内容才走缓存
  const exampleHash = hashExampleContent(EXAMPLE_FIXTURE.content)
  if (key.contentHash !== exampleHash) return null

  // 精确 key 命中（进程内）
  const memHit = memoryCache.get(cacheKeyString(key))
  if (memHit) return memHit

  // 按 contentHash 找文件，再校验其他维度
  const fileHit = findByContentHash(key.contentHash)
  if (fileHit) {
    if (
      fileHit.model === key.model &&
      fileHit.providerType === key.providerType &&
      fileHit.outputLocale === key.outputLocale &&
      fileHit.preset === key.preset
    ) {
      memoryCache.set(cacheKeyString(key), fileHit)
      return fileHit
    }
  }
  return null
}

// ============================================================================
// 写入
// ============================================================================

function writeToDisk(dir: string, entry: CachedExample): boolean {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, `${entry.contentHash}.json`)
    fs.writeFileSync(filePath, JSON.stringify(entry), 'utf-8')
    return true
  } catch (err) {
    // Vercel serverless / 只读 fs — 静默失败，不影响主流程
    return false
  }
}

/**
 * 写入三层缓存。失败不抛错（fs 不可写时降级为仅内存）。
 *
 * 仓库 fixture 目录不写：fixture 是 precompute 脚本产出的、需要进仓库的；
 * 运行时自填充只该写运行时目录，避免污染仓库 fixture。
 */
export function setExampleCache(entry: CachedExample): void {
  if (isDisabled()) return
  memoryCache.set(cacheKeyString(toKey(entry)), entry)
  writeToDisk(runtimeDir(), entry)
}

/** 工具：判断请求是不是「示例」 */
export function isExampleRequest(content: string): boolean {
  return hashExampleContent(content) === hashExampleContent(EXAMPLE_FIXTURE.content)
}

// ============================================================================
// Recorder — 录制 live 路径用于首次自填充与 precompute
// ============================================================================

export interface Recorder {
  startMs: number
  stages: RecordedStage[]
  tokens: RecordedToken[]
  /** 包装 onStage：先录制再透传 */
  wrapOnStage: (orig: ((s: any) => void) | undefined) => (s: any) => void
  /** 包装 onAgentToken：先录制再透传 */
  wrapOnAgentToken: (orig: ((a: string, d: string) => void) | undefined) => (a: string, d: string) => void
}

export function createRecorder(): Recorder {
  const startMs = Date.now()
  return {
    startMs,
    stages: [],
    tokens: [],
    wrapOnStage(orig) {
      return (s: any) => {
        this.stages.push({
          t: Date.now() - startMs,
          id: s.id,
          label: s.label,
          detail: s.detail,
        })
        orig?.(s)
      }
    },
    wrapOnAgentToken(orig) {
      return (a: string, d: string) => {
        this.tokens.push({ t: Date.now() - startMs, agent: a, delta: d })
        orig?.(a, d)
      }
    },
  }
}

// ============================================================================
// Replay — 演示性回放引擎
// ============================================================================

export interface ReplayOptions {
  /** 原始时间缩放系数（0.15 = 60s 原始 → 9s 回放） */
  timeScale: number
  /** 任意两事件最小间隔（ms）— 防止事件过密 */
  minEventGapMs: number
  /** 任意两事件最大间隔（ms）— 防止回放过慢 */
  maxEventGapMs: number
  /** 每个 stage 事件进入前至少停留 ms（保证 UI 上每阶段可见） */
  stageMinDwellMs: number
  /** 最后一个事件后等待 ms（让 UI 稳住再发 result） */
  tailMs: number
}

export const DEFAULT_REPLAY_OPTIONS: ReplayOptions = {
  timeScale: 0.15,
  minEventGapMs: 50,
  maxEventGapMs: 1200,
  stageMinDwellMs: 400,
  tailMs: 300,
}

export interface ReplaySink {
  /** 发送一个 stage 事件（route 直接调 send('stage', ...)） */
  sendStage: (stage: { id: number; label: string; detail?: string }) => void
  /** 推入一个 agent token delta（route 内部会 buffer + 节流 flush） */
  pushToken: (agent: string, delta: string) => void
  /** 立即 flush 所有缓冲的 token（用于 stage 切换前清场） */
  flushTokens: () => void
  /** 检查客户端是否断开 */
  isAborted: () => boolean
  /** 等待若干毫秒 */
  sleep: (ms: number) => Promise<void>
}

type TimelineEvent =
  | { kind: 'stage'; t: number; stage: RecordedStage }
  | { kind: 'token'; t: number; tok: RecordedToken }

function buildTimeline(entry: CachedExample): TimelineEvent[] {
  const events: TimelineEvent[] = [
    ...entry.stages.map((s) => ({ kind: 'stage' as const, t: s.t, stage: s })),
    ...entry.tokenStreams.map((tk) => ({ kind: 'token' as const, t: tk.t, tok: tk })),
  ]
  events.sort((a, b) => a.t - b.t)
  return events
}

/**
 * 回放已缓存的示例：按录制的时间线，缩放 + clamp 后重发 stage / token 事件。
 *
 * 调用方负责：先 send('ping')，调用本函数，最后 send('result', payload) + send('stage', {id:7})。
 * 本函数只负责事件回放（含尾停顿），不发 result / 不发 stage 7。
 */
export async function replayExample(
  entry: CachedExample,
  sink: ReplaySink,
  overrides: Partial<ReplayOptions> = {}
): Promise<void> {
  const o: ReplayOptions = { ...DEFAULT_REPLAY_OPTIONS, ...overrides }
  const events = buildTimeline(entry)
  if (events.length === 0) {
    // 退化：没录到任何事件（异常 fixture）— 仍给一个最小尾停顿，避免 caller 立即发 result 显得突兀
    await sink.sleep(o.tailMs)
    return
  }

  let prevT = 0
  let lastKind: 'stage' | 'token' | null = null

  for (const ev of events) {
    if (sink.isAborted()) return
    const rawGap = Math.max(0, ev.t - prevT)
    let gap = Math.round(rawGap * o.timeScale)
    if (gap < o.minEventGapMs) gap = o.minEventGapMs
    if (gap > o.maxEventGapMs) gap = o.maxEventGapMs
    if (ev.kind === 'stage' && gap < o.stageMinDwellMs) gap = o.stageMinDwellMs

    await sink.sleep(gap)
    if (sink.isAborted()) return

    if (ev.kind === 'stage') {
      // stage 切换前 flush 上一阶段的残留 token，让 token 归属清晰
      if (lastKind === 'token') sink.flushTokens()
      sink.sendStage({ id: ev.stage.id, label: ev.stage.label, detail: ev.stage.detail })
    } else {
      sink.pushToken(ev.tok.agent, ev.tok.delta)
    }
    prevT = ev.t
    lastKind = ev.kind
  }

  // 最后 flush 残留 token + 尾停顿（让 UI 看见完整 token 流后再接 result）
  sink.flushTokens()
  await sink.sleep(o.tailMs)
}

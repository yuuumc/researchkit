/**
 * D43 — Orchestration 配置常量集中
 *
 * P2-1 修复：之前 magic numbers 散落在 workflow.ts / multi-agent-stream/route.ts /
 * upload-pdf/route.ts 等多处，难追踪、难统一调整。
 *
 * 本文件集中所有 orchestration 相关的阈值，每个常量都注释说明 trade-off：
 * - 为什么是这个值
 * - 调大/调小会怎样
 */

// ============================================================================
// Workflow 循环控制
// ============================================================================

/**
 * Reflection 最大迭代次数
 *
 * - 值大 → 反思更充分，KC 质量更高，但 LLM 调用次数翻倍
 * - 值小 → 快速返回，质量兜底靠 fallback
 *
 * 2 是 hackathon demo 的甜蜜点：1 次反思能修大部分明显错误，2 次收益递减。
 * 生产环境建议 3-4。
 *
 * Vercel 环境下设为 0：完全关闭 Reflection，
 * 因为 Vercel function 60s timeout 限制，即使 MAX_ITERATIONS=1 也会超时。
 * 本地开发保持 2（无 timeout 限制）。
 */
export const MAX_ITERATIONS = process.env.VERCEL ? 0 : 2

/**
 * Replan 后 supplementary_steps 的最大执行数
 *
 * Replan 可能返回任意多 steps，这里截断到 N 防止无限循环。
 *
 * 注意（P2-2）：当前依赖 Planner 返回的顺序就是重要性顺序，但 prompt 未强制要求。
 * v2.3.1 应在 prompts/planner.ts 显式要求"按重要性从高到低排序"。
 *
 * Vercel 环境下降到 1：配合 MAX_ITERATIONS=0，避免 supplementary steps 超时。
 */
export const MAX_SUPPLEMENTARY_STEPS = process.env.VERCEL ? 1 : 2

// ============================================================================
// SSE 流式推送
// ============================================================================

/**
 * agent_token 事件的节流间隔（毫秒）
 *
 * - 值小（10ms）→ 前端动画更流畅，但 SSE 事件密集，EventSource 压力大
 * - 值大（50ms）→ SSE 事件少，但 token 动画可能掉帧（尤其在代码块密集场景）
 *
 * 30ms 是实测甜蜜点：人眼感知流畅（>30fps），SSE 事件数控制在合理范围。
 */
export const TOKEN_FLUSH_INTERVAL_MS = 30

// ============================================================================
// 输入校验
// ============================================================================

/**
 * 用户输入内容的最小长度（字符）
 *
 * 50 字符 ≈ 1-2 句话，低于此长度 LLM 无法提取有效信息。
 */
export const MIN_CONTENT_LENGTH = 50

/**
 * 用户输入内容的最大长度（字符）
 *
 * 50000 字符 ≈ 25-30 页论文，DeepSeek context window 上限是 64K tokens，
 * 留余量给 system prompt + few-shot examples。
 */
export const MAX_CONTENT_LENGTH = 50000

// ============================================================================
// 文件上传
// ============================================================================

/**
 * PDF 文件大小上限（字节）
 *
 * 10 MB 足够覆盖大部分论文 PDF（含图片）。超过此值 Vercel serverless function
 * 内存压力较大（pdf-parse 会把全文加载到内存）。
 */
export const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024

// ============================================================================
// Rate Limit
// ============================================================================

/**
 * KC 生成端点 rate limit：1 分钟内最多 10 次
 *
 * 防止单 IP 刷爆 LLM 配额。10 次/分钟足够正常用户使用，
 * 同时留出"误触重试"的余量。
 */
export const RATE_LIMIT_KC = { limit: 10, windowMs: 60_000 }

/**
 * PDF 上传端点 rate limit：10 分钟内最多 5 次
 *
 * PDF 解析 + LLM 调用最贵，单独限流。
 */
export const RATE_LIMIT_PDF = { limit: 5, windowMs: 10 * 60_000 }

/**
 * 批量端点 rate limit：10 分钟内最多 3 次
 *
 * batch 一次调用会触发 N 个 URL 的并发 LLM 调用，最贵。
 */
export const RATE_LIMIT_BATCH = { limit: 3, windowMs: 10 * 60_000 }

// ============================================================================
// Planner 重试
// ============================================================================

/**
 * Planner LLM 调用失败时的最大尝试次数（含首次）
 *
 * 3 次 = 首次 + 2 次重试，能容忍 DeepSeek/OpenAI 的短暂 429 限流。
 */
export const PLANNER_MAX_ATTEMPTS = 3

/**
 * Planner 重试的基础延迟（毫秒），实际延迟 = BASE * 2^(attempt-1)
 *
 * 1000ms → 2000ms，避免在限流期间加重服务器负担。
 */
export const PLANNER_BASE_DELAY_MS = 1000

// ============================================================================
// Example Cache 回放节拍（v2.3.3 / C）
// ============================================================================

/**
 * 回放时间缩放系数：原始 run 耗时 × 此系数 = 回放耗时
 *
 * - 0.15 = 60s 原始 → 9s 回放（甜蜜点：demo 节奏 + LiveThoughts 仍可见）
 * - 调大（接近 1）→ 更接近原始但 demo 偏慢
 * - 调小（接近 0）→ 回放过快，token 流动画掉帧
 */
export const EXAMPLE_REPLAY_TIME_SCALE = 0.15

/**
 * 回放时任意两事件最小间隔（ms）
 *
 * 防止原始 run 中两个事件 t 差 < 几毫秒时回放把 SSE 推爆；
 * 配合 30ms 的 TOKEN_FLUSH_INTERVAL_MS 保证前端能正常渲染。
 *
 * v2.3.3 修复：从 50 改为 5。token 流密集时（678 个 token）每个 50ms 会把回放拖到 33s。
 * 5ms × 678 = 3.4s，配合 30ms flush buffer 实际 SSE 事件数仍受控。
 */
export const EXAMPLE_REPLAY_MIN_EVENT_GAP_MS = 5

/**
 * 回放时任意两事件最大间隔（ms）
 *
 * 防止原始 run 中某段空闲被 1:1 还原（看起来像卡住）。
 */
export const EXAMPLE_REPLAY_MAX_EVENT_GAP_MS = 1200

/**
 * 回放时每个 stage 事件进入前的最小停留（ms）
 *
 * 保证 UI 进度面板上每阶段「可见」至少这么久。
 * 7 阶段 × 400ms = 2.8s 最小 stage 感知时长。
 */
export const EXAMPLE_REPLAY_STAGE_MIN_DWELL_MS = 400

/**
 * 回放最后一个事件后等待（ms），让 UI 稳住再发 result。
 */
export const EXAMPLE_REPLAY_TAIL_MS = 300

/**
 * v2.3.3 (C) — precompute-example CLI 包装
 *
 * 调用本地 dev 服务器的 /api/tools/precompute-example 端点。
 * 真正的预计算逻辑在该 API 路由内（需 Next.js server runtime 才能解析
 * next/headers cookies 等），这里只做 fetch + 结果展示。
 *
 * 用法：
 *   1) npm run dev
 *   2) npm run precompute-example    （另开一个终端）
 *
 * 环境变量：
 *   RESEARCHKIT_BASE_URL  默认 http://localhost:3000
 */

const BASE_URL = process.env.RESEARCHKIT_BASE_URL || 'http://localhost:3000'
const ENDPOINT = `${BASE_URL}/api/tools/precompute-example`

async function main() {
  console.log(`[precompute-example] POST ${ENDPOINT}`)
  console.log(`[precompute-example] (确保 ${BASE_URL} 的 dev server 正在运行)`)

  const start = Date.now()
  let res: Response
  try {
    res = await fetch(ENDPOINT, { method: 'POST' })
  } catch (err) {
    console.error(`[precompute-example] 无法连接 ${BASE_URL} — 请先启动 dev server (npm run dev)`)
    console.error('  错误:', err instanceof Error ? err.message : err)
    process.exit(1)
  }

  const wallMs = Date.now() - start
  const body = await res.json().catch(() => ({ success: false, error: '响应不是合法 JSON' }))

  if (!res.ok || !body.success) {
    console.error(`[precompute-example] 失败 (HTTP ${res.status}, wall ${wallMs}ms):`)
    console.error(JSON.stringify(body, null, 2))
    process.exit(1)
  }

  console.log(`[precompute-example] 成功 (wall ${wallMs}ms)`)
  console.log(JSON.stringify({
    contentHash: body.contentHash,
    fixturePath: body.fixturePath,
    wroteFixture: body.wroteFixture,
    originalDurationMs: body.originalDurationMs,
    tokenCount: body.tokenCount,
    totalTokens: body.totalTokens,
    totalCostUsd: body.totalCostUsd,
    perStage: body.perStage,
  }, null, 2))

  if (body.fixturePath) {
    console.log('')
    console.log(`→ 请将 fixture 提交到仓库：`)
    console.log(`  git add ${body.fixturePath}`)
    console.log(`  git commit -m "chore(cache): 预计算示例 fixture (${body.contentHash.slice(0, 8)})"`)
  }
  process.exit(0)
}

main().catch((err) => {
  console.error('[precompute-example] 未捕获错误:', err)
  process.exit(2)
})

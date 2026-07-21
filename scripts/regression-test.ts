/**
 * ResearchKit OS v2.2.5 — Regression Test Runner
 *
 * D17 任务：从 0 到 1 建立可重复运行的回归测试基础设施
 *
 * 设计原则（按用户偏好：避免重型依赖）：
 * - 不引入 jest/vitest，用原生 node fetch
 * - 直接调 /api/research/multi-agent-stream（SSE 端点）
 * - 输出 JSON + Markdown 双格式报告
 *
 * 使用方法：
 *   1. 启动 dev server: npm run dev
 *   2. 运行: npx tsx scripts/regression-test.ts
 *   3. 查看: scripts/reports/regression-YYYYMMDD-HHmmss.{json,md}
 *
 * 环境变量：
 *   - RESEARCHKIT_BASE_URL (默认 http://localhost:3000)
 *   - RESEARCHKIT_API_KEY (必填，用于 LLM 调用)
 *   - RESEARCHKIT_PROVIDER (默认 deepseek)
 *   - RESEARCHKIT_MODEL (默认 deepseek-chat)
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

// ============================================================================
// 类型
// ============================================================================

interface PaperFixture {
  id: string
  locale: 'en-US' | 'zh-CN'
  field: string
  title: string
  authors: string[]
  year: number
  url?: string
  abstract: string
}

interface TestCaseResult {
  fixtureId: string
  title: string
  locale: string
  field: string
  success: boolean
  durationMs: number
  totalTokens?: number
  totalCostUsd?: number
  kcTitle?: string
  kcField?: string
  kcYear?: number
  errors?: string[]
  warnings?: string[]
}

interface RegressionReport {
  runId: string
  startedAt: string
  finishedAt: string
  totalDurationMs: number
  baseUrl: string
  provider: string
  model: string
  totalCases: number
  successCount: number
  failureCount: number
  averageDurationMs: number
  averageTokens?: number
  averageCostUsd?: number
  totalTokens?: number
  totalCostUsd?: number
  results: TestCaseResult[]
}

// ============================================================================
// 配置
// ============================================================================

const BASE_URL = process.env.RESEARCHKIT_BASE_URL || 'http://localhost:3000'
const API_KEY = process.env.RESEARCHKIT_API_KEY || ''
const PROVIDER = process.env.RESEARCHKIT_PROVIDER || 'deepseek'
const MODEL = process.env.RESEARCHKIT_MODEL || 'deepseek-chat'
const RATE_LIMIT_MS = 2000  // 每篇间隔 2s，避免 LLM 限流

const PROJECT_ROOT = process.cwd()
const FIXTURES_DIR = path.join(PROJECT_ROOT, 'fixtures', 'papers')
const REPORTS_DIR = path.join(PROJECT_ROOT, 'scripts', 'reports')

// ============================================================================
// 工具函数
// ============================================================================

function timestamp(): string {
  const d = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function log(msg: string): void {
  const ts = new Date().toISOString().substring(11, 19)
  console.log(`[${ts}] ${msg}`)
}

async function loadFixtures(): Promise<PaperFixture[]> {
  const files = fs.readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.json'))
  const fixtures: PaperFixture[] = []
  for (const file of files) {
    const filepath = path.join(FIXTURES_DIR, file)
    const content = fs.readFileSync(filepath, 'utf-8')
    fixtures.push(JSON.parse(content))
  }
  return fixtures
}

// ============================================================================
// SSE 解析 — 直接调用 /api/research/multi-agent-stream
// ============================================================================

interface SSEEvent {
  event: string
  data: any
}

async function callResearchPipeline(abstract: string, locale: string, fixtureId: string): Promise<{
  success: boolean
  durationMs: number
  totalTokens?: number
  totalCostUsd?: number
  kc?: any
  error?: string
}> {
  const start = Date.now()
  const url = `${BASE_URL}/api/research/multi-agent-stream`

  // 通过 cookie 注入 provider 配置（与 Settings UI localStorage → cookie 双写一致）
  // cookie key: researchkit-provider，值是 base64(encodeURIComponent(JSON))
  // 字段：type / baseURL / apiKey / model（isValidProviderConfig 校验）
  const providerType = PROVIDER === 'deepseek' ? 'deepseek' : 'openai-compat'
  const baseURL = PROVIDER === 'deepseek' ? 'https://api.deepseek.com/v1' : 'https://api.openai.com/v1'
  const configJson = JSON.stringify({
    type: providerType,
    baseURL,
    apiKey: API_KEY,
    model: MODEL,
  })
  // Node.js 没有 btoa/escape，用 Buffer 实现 btoa(unescape(encodeURIComponent(json)))
  const base64 = Buffer.from(configJson, 'utf-8').toString('base64')
  const userConfigCookie = `researchkit-provider=${base64}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cookie': userConfigCookie,
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: abstract,
        source: `fixture-${fixtureId}`,
      }),
    })

    if (!response.ok) {
      return {
        success: false,
        durationMs: Date.now() - start,
        error: `HTTP ${response.status}: ${await response.text()}`,
      }
    }

    if (!response.body) {
      return {
        success: false,
        durationMs: Date.now() - start,
        error: 'No response body',
      }
    }

    // 解析 SSE 流
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let finalKc: any = null
    let totalTokens: number | undefined
    let totalCostUsd: number | undefined
    let lastError: string | undefined

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE 事件以 \n\n 分隔
      const events = buffer.split('\n\n')
      buffer = events.pop() || ''  // 最后一段可能不完整

      for (const eventStr of events) {
        const lines = eventStr.split('\n')
        let eventType = 'message'
        let dataStr = ''
        for (const line of lines) {
          if (line.startsWith('event:')) eventType = line.substring(6).trim()
          else if (line.startsWith('data:')) dataStr += line.substring(5).trim()
        }
        if (!dataStr) continue

        try {
          const data = JSON.parse(dataStr)
          if (eventType === 'result' && data.knowledge_card) {
            finalKc = data.knowledge_card
            totalTokens = data.total_tokens ?? data.totalTokens
            totalCostUsd = data.total_cost_usd ?? data.totalCostUsd
          } else if (eventType === 'error') {
            lastError = data.message || data.error || 'Unknown SSE error'
          }
        } catch (e) {
          // 忽略 JSON 解析错误（可能是 metadata 行）
        }
      }
    }

    return {
      success: finalKc !== null,
      durationMs: Date.now() - start,
      totalTokens,
      totalCostUsd,
      kc: finalKc,
      error: lastError,
    }
  } catch (err) {
    return {
      success: false,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ============================================================================
// KC 质量校验
// ============================================================================

interface QualityCheck {
  errors: string[]
  warnings: string[]
}

function validateKc(kc: any, fixture: PaperFixture): QualityCheck {
  const errors: string[] = []
  const warnings: string[] = []

  // 必填字段
  const requiredFields = ['title', 'authors', 'field', 'year', 'summary', 'methodology']
  for (const field of requiredFields) {
    if (!kc[field] || (Array.isArray(kc[field]) && kc[field].length === 0)) {
      errors.push(`Missing required field: ${field}`)
    }
  }

  // title 一致性（容错：fixture.title 可能比 kc.title 长，但应包含关键词）
  if (kc.title && fixture.title) {
    const fixtureTitleLower = fixture.title.toLowerCase()
    const kcTitleLower = String(kc.title).toLowerCase()
    const keywords = fixtureTitleLower.split(/[\s:,\-—]+/).filter(w => w.length > 3)
    const matched = keywords.some(kw => kcTitleLower.includes(kw))
    if (!matched) {
      warnings.push(`Title mismatch: fixture="${fixture.title.substring(0, 50)}...", kc="${String(kc.title).substring(0, 50)}..."`)
    }
  }

  // year 一致性
  if (kc.year && fixture.year && Number(kc.year) !== fixture.year) {
    warnings.push(`Year mismatch: fixture=${fixture.year}, kc=${kc.year}`)
  }

  // locale 检查
  if (fixture.locale === 'en-US') {
    const summary = String(kc.summary || '')
    const chineseCharRatio = (summary.match(/[\u4e00-\u9fa5]/g) || []).length / (summary.length || 1)
    if (chineseCharRatio > 0.1) {
      warnings.push(`English paper but KC summary contains ${(chineseCharRatio * 100).toFixed(1)}% Chinese chars`)
    }
  } else if (fixture.locale === 'zh-CN') {
    const summary = String(kc.summary || '')
    const chineseCharRatio = (summary.match(/[\u4e00-\u9fa5]/g) || []).length / (summary.length || 1)
    if (chineseCharRatio < 0.3) {
      warnings.push(`Chinese paper but KC summary contains only ${(chineseCharRatio * 100).toFixed(1)}% Chinese chars`)
    }
  }

  // summary 长度
  if (kc.summary && String(kc.summary).length < 50) {
    warnings.push(`Summary too short: ${String(kc.summary).length} chars`)
  }

  return { errors, warnings }
}

// ============================================================================
// 主流程
// ============================================================================

async function runSingleCase(fixture: PaperFixture): Promise<TestCaseResult> {
  log(`▶ ${fixture.id} [${fixture.locale}] ${fixture.title.substring(0, 40)}...`)

  const result = await callResearchPipeline(fixture.abstract, fixture.locale, fixture.id)

  const caseResult: TestCaseResult = {
    fixtureId: fixture.id,
    title: fixture.title,
    locale: fixture.locale,
    field: fixture.field,
    success: result.success,
    durationMs: result.durationMs,
    totalTokens: result.totalTokens,
    totalCostUsd: result.totalCostUsd,
  }

  if (result.success && result.kc) {
    caseResult.kcTitle = result.kc.title
    caseResult.kcField = result.kc.field
    caseResult.kcYear = result.kc.year

    const quality = validateKc(result.kc, fixture)
    if (quality.errors.length > 0) {
      caseResult.errors = quality.errors
      // 质量错误也算失败
      caseResult.success = false
    }
    if (quality.warnings.length > 0) {
      caseResult.warnings = quality.warnings
    }
    log(`  ✅ ${result.durationMs}ms / ${result.totalTokens || 0} tokens`)
  } else {
    caseResult.errors = [result.error || 'Unknown error']
    log(`  ❌ ${result.durationMs}ms: ${result.error?.substring(0, 80)}`)
  }

  return caseResult
}

function generateMarkdownReport(report: RegressionReport): string {
  const lines: string[] = []
  lines.push(`# Regression Test Report — ${report.runId}`)
  lines.push('')
  lines.push(`- **Started**: ${report.startedAt}`)
  lines.push(`- **Finished**: ${report.finishedAt}`)
  lines.push(`- **Duration**: ${(report.totalDurationMs / 1000).toFixed(1)}s`)
  lines.push(`- **Base URL**: ${report.baseUrl}`)
  lines.push(`- **Provider**: ${report.provider} / ${report.model}`)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('| Metric | Value |')
  lines.push('|---|---|')
  lines.push(`| Total Cases | ${report.totalCases} |`)
  lines.push(`| Success | ${report.successCount} |`)
  lines.push(`| Failure | ${report.failureCount} |`)
  lines.push(`| Success Rate | ${(report.successCount / report.totalCases * 100).toFixed(1)}% |`)
  lines.push(`| Avg Duration | ${(report.averageDurationMs / 1000).toFixed(1)}s |`)
  if (report.averageTokens !== undefined) {
    lines.push(`| Avg Tokens | ${Math.round(report.averageTokens)} |`)
  }
  if (report.averageCostUsd !== undefined) {
    lines.push(`| Avg Cost | $${report.averageCostUsd.toFixed(4)} |`)
  }
  if (report.totalTokens !== undefined) {
    lines.push(`| Total Tokens | ${report.totalTokens} |`)
  }
  if (report.totalCostUsd !== undefined) {
    lines.push(`| Total Cost | $${report.totalCostUsd.toFixed(4)} |`)
  }
  lines.push('')
  lines.push('## Results')
  lines.push('')
  lines.push('| ID | Locale | Field | Title | Duration | Tokens | Cost | Status |')
  lines.push('|---|---|---|---|---|---|---|---|')
  for (const r of report.results) {
    const status = r.success ? '✅' : '❌'
    const tokens = r.totalTokens ?? '-'
    const cost = r.totalCostUsd !== undefined ? `$${r.totalCostUsd.toFixed(4)}` : '-'
    const duration = `${(r.durationMs / 1000).toFixed(1)}s`
    const title = r.title.substring(0, 30) + (r.title.length > 30 ? '...' : '')
    lines.push(`| ${r.fixtureId} | ${r.locale} | ${r.field} | ${title} | ${duration} | ${tokens} | ${cost} | ${status} |`)
  }
  lines.push('')

  // 失败详情
  const failures = report.results.filter(r => !r.success)
  if (failures.length > 0) {
    lines.push('## Failure Details')
    lines.push('')
    for (const f of failures) {
      lines.push(`### ${f.fixtureId} — ${f.title}`)
      lines.push('')
      if (f.errors && f.errors.length > 0) {
        lines.push('**Errors**:')
        for (const e of f.errors) lines.push(`- ${e}`)
      }
      lines.push('')
    }
  }

  // 警告
  const warnings = report.results.filter(r => r.warnings && r.warnings.length > 0)
  if (warnings.length > 0) {
    lines.push('## Warnings')
    lines.push('')
    for (const w of warnings) {
      lines.push(`### ${w.fixtureId} — ${w.title}`)
      for (const warning of w.warnings || []) {
        lines.push(`- ⚠️ ${warning}`)
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}

async function main() {
  log(`ResearchKit OS v2.2.5 — Regression Test Runner`)
  log(`Base URL: ${BASE_URL}`)
  log(`Provider: ${PROVIDER} / ${MODEL}`)

  if (!API_KEY) {
    console.error('ERROR: RESEARCHKIT_API_KEY environment variable is required')
    console.error('  PowerShell: $env:RESEARCHKIT_API_KEY="sk-xxx"; npx tsx scripts/regression-test.ts')
    process.exit(1)
  }

  // 加载 fixtures
  const fixtures = await loadFixtures()
  log(`Loaded ${fixtures.length} fixtures`)

  // 确保 reports 目录存在
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true })
  }

  const runId = timestamp()
  const startedAt = new Date().toISOString()
  const startMs = Date.now()

  // 跑测试
  const results: TestCaseResult[] = []
  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i]
    const result = await runSingleCase(fixture)
    results.push(result)
    if (i < fixtures.length - 1) {
      log(`  ⏳ rate limit ${RATE_LIMIT_MS}ms...`)
      await sleep(RATE_LIMIT_MS)
    }
  }

  const finishedAt = new Date().toISOString()
  const totalDurationMs = Date.now() - startMs

  // 汇总
  const successCount = results.filter(r => r.success).length
  const tokenResults = results.filter(r => r.totalTokens !== undefined)
  const costResults = results.filter(r => r.totalCostUsd !== undefined)
  const totalTokens = tokenResults.reduce((sum, r) => sum + (r.totalTokens || 0), 0)
  const totalCostUsd = costResults.reduce((sum, r) => sum + (r.totalCostUsd || 0), 0)

  const report: RegressionReport = {
    runId,
    startedAt,
    finishedAt,
    totalDurationMs,
    baseUrl: BASE_URL,
    provider: PROVIDER,
    model: MODEL,
    totalCases: results.length,
    successCount,
    failureCount: results.length - successCount,
    averageDurationMs: results.reduce((sum, r) => sum + r.durationMs, 0) / results.length,
    averageTokens: tokenResults.length > 0 ? totalTokens / tokenResults.length : undefined,
    averageCostUsd: costResults.length > 0 ? totalCostUsd / costResults.length : undefined,
    totalTokens: tokenResults.length > 0 ? totalTokens : undefined,
    totalCostUsd: costResults.length > 0 ? totalCostUsd : undefined,
    results,
  }

  // 写报告
  const jsonPath = path.join(REPORTS_DIR, `regression-${runId}.json`)
  const mdPath = path.join(REPORTS_DIR, `regression-${runId}.md`)
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8')
  fs.writeFileSync(mdPath, generateMarkdownReport(report), 'utf-8')

  // 控制台汇总
  log('')
  log('═══════════════════════════════════════════════════════')
  log(`  Run ID:        ${runId}`)
  log(`  Total:         ${report.totalCases}`)
  log(`  Success:       ${successCount} / ${report.totalCases} (${(successCount / report.totalCases * 100).toFixed(1)}%)`)
  log(`  Avg Duration:  ${(report.averageDurationMs / 1000).toFixed(1)}s`)
  if (report.averageTokens !== undefined) {
    log(`  Avg Tokens:    ${Math.round(report.averageTokens)}`)
  }
  if (report.totalCostUsd !== undefined) {
    log(`  Total Cost:    $${report.totalCostUsd.toFixed(4)}`)
  }
  log(`  Total Time:    ${(totalDurationMs / 1000).toFixed(1)}s`)
  log(`  JSON:          ${jsonPath}`)
  log(`  Markdown:      ${mdPath}`)
  log('═══════════════════════════════════════════════════════')

  // 退出码：全部成功才 0
  process.exit(successCount === report.totalCases ? 0 : 1)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(2)
})

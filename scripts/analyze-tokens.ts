/**
 * D19 — Token 分布分析脚本
 * 跑 1 篇 fixture，dump 完整 metadata.per_agent_usage
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

const BASE_URL = 'http://localhost:3000'
const API_KEY = process.env.RESEARCHKIT_API_KEY || 'sk-155e462bbd5b409eb9b8e98544b19ce7'
const FIXTURE_PATH = path.join(process.cwd(), 'fixtures', 'papers', 'en-001-attention-is-all-you-need.json')

async function main() {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8'))
  console.log(`Testing: ${fixture.id} — ${fixture.title}`)

  const configJson = JSON.stringify({
    type: 'deepseek',
    baseURL: 'https://api.deepseek.com/v1',
    apiKey: API_KEY,
    model: 'deepseek-chat',
  })
  const base64 = Buffer.from(configJson, 'utf-8').toString('base64')

  const content = `Title: ${fixture.title}
Authors: ${fixture.authors.join(', ')}
Year: ${fixture.year}

${fixture.abstract}`

  const response = await fetch(`${BASE_URL}/api/research/multi-agent-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `researchkit-provider=${base64}`,
    },
    body: JSON.stringify({ content, title: fixture.title, source: `analysis-${fixture.id}` }),
  })

  if (!response.ok || !response.body) {
    console.error(`HTTP ${response.status}`)
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let resultData: any = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const rawMsg = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const lines = rawMsg.split('\n')
      let eventName = 'message'
      const dataLines: string[] = []
      for (const line of lines) {
        if (line.startsWith('event: ')) eventName = line.slice(7)
        else if (line.startsWith('data: ')) dataLines.push(line.slice(6))
      }
      if (dataLines.length === 0) continue
      try {
        const payload = JSON.parse(dataLines.join('\n'))
        if (eventName === 'result') resultData = payload
        else if (eventName === 'error') console.error('SSE error:', payload)
      } catch {}
    }
  }

  if (!resultData) {
    console.error('No result event')
    return
  }

  console.log('\n=== Token Distribution ===')
  const meta = resultData.metadata
  console.log(`Total tokens: ${meta.total_tokens}`)
  console.log(`Total cost: $${meta.total_cost_usd}`)
  console.log(`Agent count: ${meta.agent_count}`)
  console.log(`Steps executed: ${meta.steps_executed}`)
  console.log(`Reflection iterations: ${meta.reflection_iterations}`)
  console.log(`\n--- Per Agent ---`)
  const sorted = [...meta.per_agent_usage].sort((a, b) => b.totalTokens - a.totalTokens)
  for (const a of sorted) {
    console.log(`${a.agent.padEnd(15)} ${String(a.totalTokens).padStart(6)} tokens  ${a.calls} calls  $${a.costUsd.toFixed(4)}`)
  }
}

main().catch(console.error)

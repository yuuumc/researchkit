/**
 * 临时验证脚本：确认 replayExample() wall time 降到 5-7s
 * 用法：npx tsx scripts/verify-replay-wall.ts
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { replayExample, type CachedExample, type ReplaySink } from '../lib/example-cache'

async function main() {
  const fixtureDir = path.join(process.cwd(), 'fixtures', 'example-cache')
  const files = fs.readdirSync(fixtureDir).filter(f => f.endsWith('.json'))
  if (files.length === 0) {
    console.error('no fixture found')
    process.exit(1)
  }
  const fixturePath = path.join(fixtureDir, files[0])
  const entry = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as CachedExample

  let totalSleep = 0
  let stageCount = 0
  let tokenCount = 0

  const sink: ReplaySink = {
    sendStage: () => { stageCount++ },
    pushToken: () => { tokenCount++ },
    flushTokens: () => {},
    isAborted: () => false,
    sleep: async (ms: number) => {
      totalSleep += ms
      await new Promise(r => setTimeout(r, ms))
    },
  }

  const t0 = Date.now()
  await replayExample(entry, sink)
  const wall = Date.now() - t0

  console.log(`replay wall: ${wall} ms`)
  console.log(`stages: ${stageCount}  tokens: ${tokenCount}  totalSleep: ${totalSleep} ms`)
  console.log(`expected tokens: ${entry.tokenStreams.length}  stages in fixture: ${entry.stages.length}`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})

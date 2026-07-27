/**
 * x402 Service — Knowledge Memory
 *
 * POST /api/x402/knowledge-memory
 * Body: { card: KnowledgeCard, source?: string }
 * Response: { markdown, filename, tags? }
 *
 * 业务：将 KnowledgeCard 导出为 Obsidian 标准 markdown（YAML frontmatter + 双链 + tags）。
 * 复用 lib/parser.ts:exportToObsidian，无 LLM 调用，单次成本≈0。
 */

import { NextResponse } from 'next/server'
import { withX402 } from '@/lib/x402/gate'
import { BusinessError } from '@/lib/x402/run-paid'
import { exportToObsidian } from '@/lib/parser'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

function safeFilename(title: string): string {
  const cleaned = (title || 'knowledge-card')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80)
    .trim()
  return `${cleaned || 'knowledge-card'}.md`
}

function extractTags(card: any): string[] {
  const tags: string[] = []
  if (card?.field) tags.push(String(card.field).toLowerCase().replace(/\s+/g, '-'))
  if (card?.difficulty) tags.push(String(card.difficulty).toLowerCase())
  if (card?.language) tags.push(`lang-${card.language}`)
  return tags
}

const { GET, POST, OPTIONS } = withX402(
  { priceUsd: 0.005, description: 'Knowledge memory export service (Obsidian markdown)' },
  async (body) => {
    const card = body?.card
    if (!card || typeof card !== 'object') {
      throw new BusinessError(400, 'invalid_input', 'card (KnowledgeCard object) is required')
    }
    if (!card.title || typeof card.title !== 'string') {
      throw new BusinessError(400, 'invalid_input', 'card.title is required')
    }

    const source = typeof body.source === 'string' ? body.source : undefined

    let markdown: string
    try {
      markdown = exportToObsidian(card, source)
    } catch (e) {
      throw new BusinessError(502, 'export_failed', `exportToObsidian failed: ${e instanceof Error ? e.message : String(e)}`)
    }

    return NextResponse.json({
      markdown,
      filename: safeFilename(card.title),
      tags: extractTags(card),
    })
  }
)

export { GET, POST, OPTIONS }

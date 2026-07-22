/**
 * D32 — Plugin Marketplace API
 *
 * GET  /api/plugins/marketplace           — 返回全部市场 manifest
 * GET  /api/plugins/marketplace?id=xxx     — 返回单个 manifest
 *
 * v2.3 范围：mock 数据（不真实远程加载代码）
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAllManifests, findManifest } from '@/lib/persistence/plugin-marketplace-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const id = url.searchParams.get('id')

    if (id) {
      const manifest = findManifest(id)
      if (!manifest) {
        return NextResponse.json({ error: `Plugin "${id}" not found` }, { status: 404 })
      }
      return NextResponse.json({ manifest })
    }

    const manifests = getAllManifests()
    return NextResponse.json({
      manifests,
      version: '2.3.0',
      updatedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[api/plugins/marketplace] GET failed:', err)
    return NextResponse.json({ error: 'Failed to load marketplace' }, { status: 500 })
  }
}

/**
 * D32 — Plugin Install API
 *
 * POST /api/plugins/install
 * body: { pluginId: string }
 *
 * 模拟安装：
 * - 接收 pluginId
 * - 返回完整 PluginManifest（client 把它存到 localStorage）
 * - 不真实加载远程代码（v2.4 沙箱化后实现）
 *
 * 安装流程：
 * - 内置插件（official=true）：直接返回 manifest（已默认"安装"）
 * - 社区插件：模拟 100-500ms 安装延迟，返回 manifest
 */

import { NextRequest, NextResponse } from 'next/server'
import { findManifest } from '@/lib/persistence/plugin-marketplace-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const pluginId = String(body?.pluginId || '').trim()
    if (!pluginId) {
      return NextResponse.json({ error: 'pluginId is required' }, { status: 400 })
    }

    const manifest = findManifest(pluginId)
    if (!manifest) {
      return NextResponse.json({ error: `Plugin "${pluginId}" not found in marketplace` }, { status: 404 })
    }

    // 模拟安装延迟（社区插件 100-500ms，官方 0ms）
    if (!manifest.official) {
      const delay = 100 + Math.floor(Math.random() * 400)
      await new Promise(resolve => setTimeout(resolve, delay))
    }

    // 模拟"安装成功"（不真实加载代码）
    return NextResponse.json({
      success: true,
      manifest,
      installedAt: Date.now(),
      message: `插件 "${manifest.name}" 安装成功`,
    })
  } catch (err) {
    console.error('[api/plugins/install] POST failed:', err)
    return NextResponse.json({ error: 'Failed to install plugin' }, { status: 500 })
  }
}

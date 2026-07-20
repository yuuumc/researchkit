/**
 * Chip / PipelineChip — UI chip 组件
 *
 * v2.0 重构 — 从 app/page.tsx 抽出
 * - Chip：Hero 区透明背景玻璃风 chip
 * - PipelineChip：白底紫边 chip，用于 Agent Pipeline
 */

import type { ReactNode } from 'react'

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 10px', background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(4px)', borderRadius: '999px', fontSize: '12px', fontWeight: 500 }}>{children}</span>
  )
}

export function PipelineChip({ children }: { children: ReactNode }) {
  return (
    <span className="pipeline-chip" style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', background: 'white', border: '1px solid #ddd6fe', color: '#6d28d9', borderRadius: '999px', fontSize: '11px', fontWeight: 600 }}>{children}</span>
  )
}

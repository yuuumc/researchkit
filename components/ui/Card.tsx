/**
 * Card — 可折叠卡片组件
 *
 * v2.0 重构 — 从 app/page.tsx 抽出
 * 支持：
 * - defaultOpen：默认展开/折叠
 * - 左侧彩色边框
 * - 入场动画（card-field-enter，由 index 控制延迟）
 */

'use client'

import { useState } from 'react'

export interface CardProps {
  title: string
  color: string
  children: React.ReactNode
  defaultOpen?: boolean
  index?: number
}

export function Card({ title, color, children, defaultOpen = false, index = 0 }: CardProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div
      className="hoverable-card card-field-enter"
      style={{
        background: 'white',
        borderRadius: '16px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
        marginBottom: '16px',
        borderLeft: `4px solid ${color}`,
        overflow: 'hidden',
        animationDelay: `${index * 0.08}s`,
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          padding: '16px 24px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          textAlign: 'left',
          boxSizing: 'border-box',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f1729' }}>{title}</h3>
        <span style={{ color: '#94a3b8', fontSize: '14px', fontWeight: 700, flexShrink: 0, transition: 'transform 0.3s ease', display: 'inline-block', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
      </button>
      {open && (
        <div className="accordion-body" style={{ padding: '0 24px 20px', maxHeight: '5000px', opacity: 1 }}>
          {children}
        </div>
      )}
    </div>
  )
}

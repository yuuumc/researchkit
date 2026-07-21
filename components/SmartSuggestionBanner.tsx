'use client'

/**
 * SmartSuggestionBanner — D9 Memory v1
 *
 * 当用户生成新 KC 时，如果检测到与历史 KC 有相关性（同领域/同作者/共享术语），
 * 弹出此 Banner，提示用户一键跳转 Compare 对比。
 *
 * UI 设计：
 * - 渐变背景（amber → yellow）— 引起注意但不刺眼
 * - 左侧：图标 + 关系标题 + 历史论文标题
 * - 中部：reasons（次要信号）+ 时间相对值（"昨天读过" / "3 天前"）
 * - 右侧：[⚡ Compare Now] [✕ Dismiss]
 *
 * 行为：
 * - Compare Now → 调用 onCompareNow(suggestion.bestMatch.id) 切换 Compare tab + 预选
 * - Dismiss → 调用 onDismiss() 隐藏 banner（本次会话内不再弹出）
 *
 * 持久化：v1 不持久化 dismiss 状态（下次刷新会重新计算）
 *          v2 升级到 localStorage 'researchkit:dismissed-suggestions' 数组
 */

import { useState } from 'react'
import type { SmartSuggestion } from '@/lib/smart-suggestion'
import { getSuggestionIcon, getSuggestionTitle } from '@/lib/smart-suggestion'
import { btnPrimary, btnSecondary } from '@/lib/ui-styles'

// ============================================================================
// Props
// ============================================================================

export interface SmartSuggestionBannerProps {
  suggestion: SmartSuggestion
  onCompareNow: () => void
  onDismiss: () => void
}

// ============================================================================
// 主组件
// ============================================================================

export function SmartSuggestionBanner({
  suggestion,
  onCompareNow,
  onDismiss,
}: SmartSuggestionBannerProps) {
  const [hovered, setHovered] = useState(false)

  if (!suggestion.bestMatch) return null

  const { bestMatch, reasons, relationType, score } = suggestion
  const icon = getSuggestionIcon(relationType)
  const title = getSuggestionTitle(suggestion)
  const time = fmtRelativeTime(bestMatch.timestamp)

  // 次要 reasons（去掉第一个 — 第一个已在标题显示）
  const secondaryReasons = reasons.slice(1, 3)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered
          ? 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)'
          : 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
        border: '1px solid #f59e0b',
        borderRadius: '12px',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexWrap: 'wrap',
        boxShadow: hovered ? '0 4px 12px rgba(245, 158, 11, 0.2)' : '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'all 0.2s',
        position: 'relative',
        cursor: 'pointer',
      }}
      onClick={onCompareNow}
    >
      {/* 图标 */}
      <span style={{ fontSize: '24px', flexShrink: 0 }}>{icon}</span>

      {/* 内容 */}
      <div style={{ flex: 1, minWidth: '220px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
          💡 Smart Suggestion · Score {score}
        </div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#78350f', marginBottom: '4px' }}>
          {title}
        </div>
        <div style={{ fontSize: '13px', color: '#92400e' }}>
          <span style={{ fontWeight: 600 }}>{bestMatch.title}</span>
          {bestMatch.year && <span style={{ color: '#b45309', marginLeft: '6px' }}>({bestMatch.year})</span>}
          <span style={{ color: '#a16207', marginLeft: '8px', fontSize: '11px' }}>· {time}</span>
        </div>
        {secondaryReasons.length > 0 && (
          <div style={{ fontSize: '11px', color: '#a16207', marginTop: '4px', fontStyle: 'italic' }}>
            {secondaryReasons.join(' · ')}
          </div>
        )}
      </div>

      {/* 按钮 */}
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onCompareNow}
          style={{
            ...btnPrimary,
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            borderColor: '#d97706',
            padding: '6px 12px',
            fontSize: '13px',
            fontWeight: 700,
          }}
        >
          ⚡ Compare Now
        </button>
        <button
          onClick={onDismiss}
          aria-label="Dismiss suggestion"
          style={{
            ...btnSecondary,
            padding: '6px 10px',
            fontSize: '13px',
            background: 'transparent',
            border: '1px solid transparent',
            color: '#92400e',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#fef3c7'
            e.currentTarget.style.borderColor = '#f59e0b'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'transparent'
          }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// 辅助
// ============================================================================

function fmtRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}分钟前`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}小时前`
  const days = Math.floor(diff / 86400_000)
  if (days === 1) return '昨天'
  if (days < 7) return `${days}天前`
  if (days < 30) return `${Math.floor(days / 7)}周前`
  return `${Math.floor(days / 30)}月前`
}

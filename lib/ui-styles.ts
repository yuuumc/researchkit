/**
 * UI 样式常量
 *
 * v2.0 重构 — 从 app/page.tsx 抽出
 * 共享样式对象，避免重复定义
 */

import type { CSSProperties } from 'react'

/** 主按钮样式（渐变） */
export const btnPrimary: CSSProperties = {
  padding: '10px 16px',
  background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
  color: 'white',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 600,
}

/** 次按钮样式（灰底） */
export const btnSecondary: CSSProperties = {
  padding: '10px 16px',
  background: '#f1f5f9',
  color: '#5a6478',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 600,
}

/** Tab 按钮样式（active 时渐变，inactive 时灰底） */
export function tabStyle(active: boolean): CSSProperties {
  return {
    flex: 1,
    padding: '10px 16px',
    borderRadius: '10px',
    border: 'none',
    cursor: 'pointer',
    background: active ? 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)' : '#f1f5f9',
    color: active ? 'white' : '#5a6478',
    fontWeight: 600,
    fontSize: '14px',
  }
}

/** 输入框样式 */
export const inputStyle: CSSProperties = {
  width: '100%',
  minHeight: '180px',
  padding: '16px',
  border: '2px solid #e2e8f2',
  borderRadius: '12px',
  fontSize: '14px',
  fontFamily: 'inherit',
  resize: 'vertical',
  outline: 'none',
  transition: 'border-color 0.2s',
  boxSizing: 'border-box',
  display: 'block',
  margin: 0,
}

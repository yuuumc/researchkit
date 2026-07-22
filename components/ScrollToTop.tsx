'use client'

/**
 * ScrollToTop — D34 UI 打磨
 *
 * 浮动"回到顶部"按钮 + 滚动进度环：
 * - 页面滚动超过 400px 时浮现（fade + slide up）
 * - 外圈 SVG 进度环显示页面滚动百分比
 * - 点击平滑滚动到顶部（behavior: 'smooth'）
 * - 玻璃态深色背景 + 向上箭头
 * - hover 时微微抬升 + 发光
 *
 * 用法：直接放在页面最外层 div 内即可（fixed 定位，不占文档流）
 */

import { useState, useEffect, useCallback } from 'react'

const SHOW_THRESHOLD = 400
const RING_RADIUS = 22
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

export function ScrollToTop() {
  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState(0)

  const handleScroll = useCallback(() => {
    const scrollY = window.scrollY
    const docHeight = document.documentElement.scrollHeight - window.innerHeight
    setVisible(scrollY > SHOW_THRESHOLD)
    setProgress(docHeight > 0 ? Math.min(scrollY / docHeight, 1) : 0)
  }, [])

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)
    handleScroll() // 初始化
    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [handleScroll])

  const handleClick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const dashOffset = RING_CIRCUMFERENCE * (1 - progress)

  return (
    <button
      onClick={handleClick}
      aria-label="回到顶部"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        border: 'none',
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        color: 'white',
        fontSize: '18px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.8)',
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
        padding: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px) scale(1.05)'
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(99, 102, 241, 0.3)'
        e.currentTarget.style.background = 'rgba(99, 102, 241, 0.85)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = visible ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.8)'
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.2)'
        e.currentTarget.style.background = 'rgba(15, 23, 42, 0.75)'
      }}
      title="回到顶部"
    >
      {/* SVG 进度环 */}
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transform: 'rotate(-90deg)',
        }}
      >
        {/* 底环 */}
        <circle
          cx="24"
          cy="24"
          r={RING_RADIUS}
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="2"
        />
        {/* 进度环 */}
        <circle
          cx="24"
          cy="24"
          r={RING_RADIUS}
          fill="none"
          stroke="url(#scrollGrad)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 0.1s linear' }}
        />
        <defs>
          <linearGradient id="scrollGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
      </svg>
      {/* 箭头 */}
      <span style={{ position: 'relative', zIndex: 1, fontWeight: 700 }}>↑</span>
    </button>
  )
}

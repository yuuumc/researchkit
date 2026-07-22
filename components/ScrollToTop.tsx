'use client'

/**
 * ScrollToTop — D34 UI 打磨 + 拖拽增强
 *
 * 浮动"回到顶部"按钮 + 滚动进度环：
 * - 页面滚动超过 400px 时浮现（fade + slide up）
 * - 外圈 SVG 进度环显示页面滚动百分比
 * - 点击平滑滚动到顶部（behavior: 'smooth'）
 * - 玻璃态深色背景 + 向上箭头
 * - 可拖拽：mousedown + mousemove 移动按钮位置；移动距离 < 4px 视为点击
 *   （拖拽过不触发回顶，避免误操作）
 * - 位置约束在视口内 + 留 24px 边距
 *
 * 用法：直接放在页面最外层 div 内即可（fixed 定位，不占文档流）
 */

import { useState, useEffect, useCallback, useRef } from 'react'

const SHOW_THRESHOLD = 400
const RING_RADIUS = 22
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS
const DRAG_THRESHOLD = 4 // 移动超过 4px 视为拖拽，不触发点击
const BTN_SIZE = 48
const EDGE_MARGIN = 16

export function ScrollToTop() {
  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState(0)
  // pos = null 表示用默认位置（右下角），拖拽后用 left/top
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [hovering, setHovering] = useState(false)
  const dragRef = useRef<{
    moved: boolean
    startX: number
    startY: number
    startLeft: number
    startTop: number
  } | null>(null)

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

  const handleClick = (e: React.MouseEvent) => {
    // 拖拽过则不触发回顶（避免拖完手松误触）
    if (dragRef.current?.moved) {
      e.preventDefault()
      return
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    dragRef.current = {
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
    }
    setDragging(true)
    e.preventDefault() // 防止文本选中
  }

  useEffect(() => {
    if (!dragging) return
    const handleMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        dragRef.current.moved = true
      }
      if (dragRef.current.moved) {
        const newLeft = Math.max(EDGE_MARGIN, Math.min(
          window.innerWidth - BTN_SIZE - EDGE_MARGIN,
          dragRef.current.startLeft + dx
        ))
        const newTop = Math.max(EDGE_MARGIN, Math.min(
          window.innerHeight - BTN_SIZE - EDGE_MARGIN,
          dragRef.current.startTop + dy
        ))
        setPos({ left: newLeft, top: newTop })
      }
    }
    const handleUp = () => {
      setDragging(false)
      // 保留 moved 标志到 click 事件触发后清除
      setTimeout(() => {
        dragRef.current = null
      }, 50)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [dragging])

  const dashOffset = RING_CIRCUMFERENCE * (1 - progress)

  // 位置：拖拽过用 left/top，否则默认 right/bottom
  const positionStyle: React.CSSProperties = pos
    ? { left: `${pos.left}px`, top: `${pos.top}px`, right: 'auto', bottom: 'auto' }
    : { right: '24px', bottom: '24px' }

  return (
    <button
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      aria-label="回到顶部（可拖拽）"
      title="点击回到顶部 · 拖拽移动位置"
      style={{
        position: 'fixed',
        width: '48px',
        height: '48px',
        ...positionStyle,
        borderRadius: '50%',
        border: 'none',
        background: dragging
          ? 'rgba(99, 102, 241, 0.95)'
          : hovering
            ? 'rgba(99, 102, 241, 0.85)'
            : 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        color: 'white',
        fontSize: '18px',
        cursor: dragging ? 'grabbing' : 'grab',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        opacity: visible ? 1 : 0,
        transform: visible
          ? (hovering ? 'translateY(-4px) scale(1.05)' : 'translateY(0) scale(1)')
          : 'translateY(20px) scale(0.8)',
        pointerEvents: visible ? 'auto' : 'none',
        transition: dragging ? 'none' : 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: dragging
          ? '0 12px 32px rgba(99, 102, 241, 0.5)'
          : hovering
            ? '0 8px 24px rgba(99, 102, 241, 0.3)'
            : '0 4px 16px rgba(0, 0, 0, 0.2)',
        padding: 0,
        userSelect: 'none',
      }}
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

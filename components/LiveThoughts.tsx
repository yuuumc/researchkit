'use client'

/**
 * D28 Live Thoughts — 实时展示 Agent token 流式输出
 *
 * 数据来源：SSE 的 `agent_token` 事件
 * （Planner / Reflection / Replan 三个 text-mode Agent 输出的每个 delta）
 *
 * UI 设计：
 * - 右下角浮窗，固定定位
 * - 每个 agent 一块，展示 raw token 文本 + 闪烁光标
 * - header 可点击折叠/展开
 * - hover 浮起 + 边框发光
 * - active=false 或 thoughts 为空时不渲染
 */

import { useState, useEffect, useRef } from 'react'

export interface LiveThought {
  agent: string
  text: string
}

interface LiveThoughtsProps {
  thoughts: LiveThought[]
  active: boolean
}

const AGENT_COLORS: Record<string, string> = {
  Planner: '#818cf8',
  Reflection: '#fbbf24',
  Replan: '#f87171',
}

const AGENT_LABELS: Record<string, string> = {
  Planner: '🧠 Planner',
  Reflection: '🔁 Reflection',
  Replan: '♻️ Replan',
}

export function LiveThoughts({ thoughts, active }: LiveThoughtsProps) {
  const [collapsed, setCollapsed] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底（thoughts 变化时）
  useEffect(() => {
    if (scrollRef.current && !collapsed) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [thoughts, collapsed])

  // loading 结束后 3 秒淡出隐藏（active=false 时延迟卸载）
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (active) {
      setVisible(true)
    } else if (visible) {
      const t = window.setTimeout(() => setVisible(false), 2500)
      return () => window.clearTimeout(t)
    }
  }, [active, visible])

  if (!visible || thoughts.length === 0) return null

  const totalChars = thoughts.reduce((acc, t) => acc + t.text.length, 0)

  return (
    <div
      className="live-thoughts"
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        width: '400px',
        maxHeight: collapsed ? '48px' : '55vh',
        background: 'rgba(15, 23, 42, 0.96)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: '14px',
        boxShadow: '0 12px 48px rgba(99, 102, 241, 0.28), 0 0 0 1px rgba(99, 102, 241, 0.25)',
        zIndex: 1500,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'max-height 0.25s ease, box-shadow 0.2s ease, transform 0.2s ease',
        cursor: 'pointer',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 16px 56px rgba(99, 102, 241, 0.4), 0 0 0 1px rgba(99, 102, 241, 0.4)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 12px 48px rgba(99, 102, 241, 0.28), 0 0 0 1px rgba(99, 102, 241, 0.25)'
      }}
      onClick={() => setCollapsed(c => !c)}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: collapsed ? 'none' : '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          userSelect: 'none',
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: active ? '#10b981' : '#64748b',
            boxShadow: active ? '0 0 8px #10b981' : 'none',
            animation: active ? 'live-thoughts-pulse 1.5s infinite' : 'none',
            flexShrink: 0,
          }}
        />
        <span style={{ color: 'white', fontSize: '13px', fontWeight: 600 }}>
          {active ? 'AI Live Thoughts' : 'Thoughts Complete'}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            color: 'rgba(255,255,255,0.45)',
            fontSize: '11px',
            fontFamily: 'ui-monospace, Menlo, monospace',
          }}
        >
          {thoughts.length} agent{thoughts.length > 1 ? 's' : ''} · {totalChars.toLocaleString()} chars
        </span>
        <span
          style={{
            color: 'rgba(255,255,255,0.4)',
            fontSize: '11px',
            marginLeft: '6px',
            transition: 'transform 0.2s ease',
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          }}
        >
          ▼
        </span>
      </div>

      {/* Body — 每个 agent 一块 */}
      {!collapsed && (
        <div
          ref={scrollRef}
          style={{
            padding: '10px 14px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {thoughts.map(({ agent, text }) => {
            const color = AGENT_COLORS[agent] || '#94a3b8'
            const label = AGENT_LABELS[agent] || `🤖 ${agent}`
            return (
              <div key={agent}>
                <div
                  style={{
                    color,
                    fontSize: '10px',
                    fontWeight: 700,
                    marginBottom: '4px',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: color }} />
                  {label}
                </div>
                <pre
                  style={{
                    color: 'rgba(255,255,255,0.82)',
                    fontFamily: 'ui-monospace, Menlo, Monaco, "Cascadia Code", monospace',
                    fontSize: '11px',
                    lineHeight: '1.55',
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: '180px',
                    overflow: 'hidden',
                  }}
                >
                  {text}
                  {active && (
                    <span
                      style={{
                        display: 'inline-block',
                        width: '6px',
                        height: '12px',
                        background: color,
                        marginLeft: '2px',
                        verticalAlign: 'middle',
                        animation: 'live-thoughts-blink 1s steps(2, end) infinite',
                      }}
                    />
                  )}
                </pre>
              </div>
            )
          })}
        </div>
      )}

      <style>{`
        @keyframes live-thoughts-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes live-thoughts-blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}

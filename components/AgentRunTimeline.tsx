'use client'

/**
 * v2.4.0 — AgentRunTimeline
 *
 * 接 POST /api/agent/run (SSE)，渲染：
 * 1. 顶栏：goal / status 徽章 / 实时耗时 / 总花费
 * 2. 步骤流：每个 stage 卡片，完成/进行中/待执行 三态
 * 3. Agent token 流：每个 agent 一个可折叠块（默认折叠，仅显示 char 计数）
 * 4. 最终结果：Final answer (MarkdownLite 渲染) + References 列表 + 复制按钮
 *
 * SSE 解析策略：
 * - fetch + ReadableStream（不是 EventSource，因为 EventSource 不支持 POST body + abort）
 * - 30ms flush token buffer，避免每个 token 触发 setState
 * - 阶段 done 时把所有 stage 标为 done（终态信号）
 *
 * 与 multi-agent-stream 端的协议保持一致（v2.3.3 复用契约）。
 */

import { useState, useRef, useEffect, useCallback, type CSSProperties } from 'react'
import { useI18n } from '@/components/I18nProvider'

// ============================================================================
// Types
// ============================================================================

export interface AgentRunResult {
  session_id: string
  final_answer: string
  references: Array<{ materialId: string; snippet: string; citeIndex: number }>
  steps: Array<{
    id: string
    index: number
    kind: string
    rationale: string
    status: string
    outputSummary?: string
    durationMs?: number
    costUsd?: number
  }>
  total_cost_usd: number
  total_duration_ms: number
}

export interface AgentRunTimelineProps {
  goal: string
  sessionId?: string
  locale?: string
  maxSteps?: number
  /** Auto-run on mount if true. Default: true. */
  autoRun?: boolean
  onComplete?: (result: AgentRunResult) => void
}

interface StageEntry {
  id: string
  label: string
  status: 'pending' | 'running' | 'done'
}

interface AgentToken {
  agent: string
  text: string
}

type Status = 'idle' | 'running' | 'done' | 'error' | 'cancelled'

// ============================================================================
// Constants
// ============================================================================

const STAGE_ICONS: Record<string, string> = {
  plan: '🧠',
  'multi-agent': '🧠',
  web: '🌐',
  arxiv: '📄',
  'memory-recall': '💭',
  synthesize: '✨',
  done: '✅',
}

const AGENT_COLORS: Record<string, string> = {
  Planner: '#818cf8',
  Reflection: '#fbbf24',
  Replan: '#f87171',
  Synthesizer: '#10b981',
  Summarizer: '#10b981',
}

const STATUS_COLOR: Record<Status, string> = {
  idle: '#94a3b8',
  running: '#3b82f6',
  done: '#10b981',
  error: '#ef4444',
  cancelled: '#f59e0b',
}

// STATUS_LABEL removed — use t('agentRun.status.*') at render time instead

const TOKEN_FLUSH_MS = 30

// ============================================================================
// Main component
// ============================================================================

export function AgentRunTimeline({
  goal,
  sessionId,
  locale,
  maxSteps,
  autoRun = true,
  onComplete,
}: AgentRunTimelineProps) {
  const { t } = useI18n()
  const [status, setStatus] = useState<Status>('idle')
  const [stages, setStages] = useState<StageEntry[]>([])
  const [tokens, setTokens] = useState<AgentToken[]>([])
  const [result, setResult] = useState<AgentRunResult | null>(null)
  const [error, setError] = useState<string>('')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [copied, setCopied] = useState<'md' | 'ref' | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const tokenBufferRef = useRef<Map<string, string>>(new Map())
  const flushTimerRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const onCompleteRef = useRef(onComplete)

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  // elapsed timer
  useEffect(() => {
    if (status !== 'running') return
    const interval = window.setInterval(() => {
      if (startTimeRef.current > 0) {
        setElapsedMs(Date.now() - startTimeRef.current)
      }
    }, 250)
    return () => window.clearInterval(interval)
  }, [status])

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
      if (abortRef.current) {
        abortRef.current.abort()
      }
    }
  }, [])

  const run = useCallback(async () => {
    if (!goal || goal.length < 5) {
      setError(t('agentRun.timeline.goalTooShort'))
      setStatus('error')
      return
    }

    // reset
    setStatus('running')
    setStages([])
    setTokens([])
    setResult(null)
    setError('')
    setElapsedMs(0)
    setCopied(null)
    startTimeRef.current = Date.now()
    tokenBufferRef.current = new Map()
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }

    const ctrl = new AbortController()
    abortRef.current = ctrl

    const flushTokens = () => {
      flushTimerRef.current = null
      if (tokenBufferRef.current.size === 0) return
      setTokens((prev) => {
        const map = new Map(prev.map((t) => [t.agent, t.text]))
        for (const [agent, text] of Array.from(tokenBufferRef.current)) {
          map.set(agent, (map.get(agent) ?? '') + text)
        }
        return Array.from(map).map(([agent, text]) => ({ agent, text }))
      })
      tokenBufferRef.current = new Map()
    }
    const scheduleFlush = () => {
      if (flushTimerRef.current === null) {
        flushTimerRef.current = window.setTimeout(flushTokens, TOKEN_FLUSH_MS)
      }
    }

    try {
      const resp = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal,
          session_id: sessionId,
          locale,
          max_steps: maxSteps,
        }),
        signal: ctrl.signal,
      })

      if (!resp.ok && resp.status !== 200) {
        // SSE errors come as 200 + event:error in the stream
        // but 429 / 400 etc. come as plain HTTP
        const text = await resp.text()
        let msg = `HTTP ${resp.status}`
        try {
          const parsed = JSON.parse(text)
          if (parsed.error) msg = parsed.error
        } catch {
          msg += `: ${text.slice(0, 200)}`
        }
        setError(msg)
        setStatus('error')
        return
      }

      const reader = resp.body?.getReader()
      if (!reader) {
        setError('No response body')
        setStatus('error')
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let idx
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const eventBlock = buffer.slice(0, idx)
          buffer = buffer.slice(idx + 2)
          if (!eventBlock.trim()) continue

          const lines = eventBlock.split('\n')
          let evtName = 'message'
          let dataStr = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              evtName = line.slice(7).trim()
            } else if (line.startsWith('data: ')) {
              dataStr += line.slice(6)
            }
          }
          if (!dataStr) continue

          let data: unknown
          try {
            data = JSON.parse(dataStr)
          } catch {
            continue
          }

          if (evtName === 'ping') {
            // first-byte flush signal; nothing to render
          } else if (evtName === 'stage') {
            const d = data as { id: string; label?: string }
            setStages((prev) => {
              if (d.id === 'done') {
                return prev.map((s) => ({ ...s, status: 'done' as const }))
              }
              const existing = prev.find((s) => s.id === d.id)
              if (existing) {
                existing.label = d.label || existing.label
                return [...prev]
              }
              return [
                ...prev.map((s) => ({ ...s, status: 'done' as const })),
                { id: d.id, label: d.label || d.id, status: 'running' as const },
              ]
            })
          } else if (evtName === 'agent_token') {
            const d = data as { agent: string; delta: string }
            if (!d.agent || !d.delta) continue
            tokenBufferRef.current.set(
              d.agent,
              (tokenBufferRef.current.get(d.agent) ?? '') + d.delta,
            )
            scheduleFlush()
          } else if (evtName === 'result') {
            flushTokens()
            const d = data as unknown as AgentRunResult & {
              session_id: string
              final_answer: string
              total_cost_usd: number
              total_duration_ms: number
            }
            // map snake_case to camelCase expected by interface
            const normalized: AgentRunResult = {
              session_id: d.session_id,
              final_answer: d.final_answer,
              references: Array.isArray(d.references) ? d.references : [],
              steps: Array.isArray(d.steps) ? d.steps : [],
              total_cost_usd: d.total_cost_usd,
              total_duration_ms: d.total_duration_ms,
            }
            setResult(normalized)
            setStatus('done')
            onCompleteRef.current?.(normalized)
          } else if (evtName === 'error') {
            const d = data as { error: string }
            setError(d.error || 'unknown error')
            setStatus('error')
          }
        }
      }

      flushTokens()
      // stream ended without explicit result event
      setStatus((prev) => (prev === 'running' ? 'done' : prev))
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setStatus('cancelled')
      } else {
        setError(err instanceof Error ? err.message : 'unknown error')
        setStatus('error')
      }
    } finally {
      abortRef.current = null
    }
  }, [goal, sessionId, locale, maxSteps, t])

  // auto-run on mount
  useEffect(() => {
    if (autoRun && status === 'idle' && goal && goal.length >= 5) {
      void run()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cancel = () => {
    abortRef.current?.abort()
  }

  const copyToClipboard = async (text: string, kind: 'md' | 'ref') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      window.setTimeout(() => setCopied(null), 2000)
    } catch {
      // clipboard not available; ignore
    }
  }

  return (
    <div
      style={{
        background: 'white',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        overflow: 'hidden',
      }}
    >
      {/* === Header === */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '11px',
              color: '#64748b',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: '4px',
            }}
          >
            🤖 {t('agentRun.timeline.headerLabel', {
              session: sessionId
                ? t('agentRun.timeline.headerResumeSession', { id: sessionId.slice(0, 18) })
                : t('agentRun.timeline.headerNewSession'),
            })}
          </div>
          <div
            style={{
              fontSize: '14px',
              color: '#0f172a',
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={goal}
          >
            {goal || t('agentRun.timeline.emptyGoal')}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: '999px',
              fontSize: '11px',
              fontWeight: 700,
              color: 'white',
              background: STATUS_COLOR[status],
            }}
          >
            {t(`agentRun.status.${status}`)}
          </span>
          {status === 'running' && (
            <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'ui-monospace, monospace' }}>
              ⏱ {(elapsedMs / 1000).toFixed(1)}s
            </span>
          )}
          {result && (
            <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'ui-monospace, monospace' }}>
              💰 ${result.total_cost_usd.toFixed(4)} · {(result.total_duration_ms / 1000).toFixed(1)}s
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {status === 'idle' && (
            <button
              onClick={() => void run()}
              disabled={!goal || goal.length < 5}
              style={{
                padding: '8px 14px',
                background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: goal && goal.length >= 5 ? 'pointer' : 'not-allowed',
                fontSize: '13px',
                fontWeight: 700,
                opacity: goal && goal.length >= 5 ? 1 : 0.5,
              }}
            >
              ▶ {t('agentRun.timeline.runBtn')}
            </button>
          )}
          {status === 'running' && (
            <button
              onClick={cancel}
              style={{
                padding: '8px 14px',
                background: '#f1f5f9',
                color: '#5a6478',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              ⏹ {t('agentRun.timeline.cancelBtn')}
            </button>
          )}
          {(status === 'done' || status === 'error' || status === 'cancelled') && (
            <button
              onClick={() => void run()}
              style={{
                padding: '8px 14px',
                background: '#f1f5f9',
                color: '#5a6478',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              ↻ {t('agentRun.timeline.rerunBtn')}
            </button>
          )}
        </div>
      </div>

      {/* === Error === */}
      {error && (
        <div
          style={{
            padding: '12px 20px',
            background: '#fef2f2',
            borderBottom: '1px solid #fecaca',
            color: '#991b1b',
            fontSize: '12px',
          }}
        >
          ❌ {error}
        </div>
      )}

      {/* === Stages === */}
      {stages.length > 0 && (
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <div
            style={{
              fontSize: '10px',
              color: '#64748b',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: '8px',
            }}
          >
            {t('agentRun.timeline.stepFlowLabel')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {stages.map((s, i) => (
              <div
                key={`${s.id}-${i}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: s.status === 'running' ? '#eff6ff' : s.status === 'done' ? '#f0fdf4' : '#f8fafc',
                  border: `1px solid ${
                    s.status === 'running' ? '#bfdbfe' : s.status === 'done' ? '#bbf7d0' : '#e2e8f0'
                  }`,
                }}
              >
                {s.status === 'done' ? (
                  <span style={{ color: '#10b981', fontSize: '14px', fontWeight: 700 }}>✓</span>
                ) : s.status === 'running' ? (
                  <span
                    style={{
                      display: 'inline-block',
                      width: '12px',
                      height: '12px',
                      border: '2px solid #3b82f6',
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      animation: 'agent-spin 0.8s linear infinite',
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <span style={{ color: '#94a3b8', fontSize: '14px' }}>○</span>
                )}
                <span
                  style={{
                    fontSize: '12px',
                    color: s.status === 'pending' ? '#94a3b8' : '#0f172a',
                    fontWeight: s.status === 'running' ? 600 : 400,
                  }}
                >
                  {STAGE_ICONS[s.id] || '⚙️'} {s.label}
                </span>
                {s.status === 'running' && (
                  <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#3b82f6' }}>
                    {t('agentRun.timeline.stageRunningHint')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === Agent tokens === */}
      {tokens.length > 0 && (
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <div
            style={{
              fontSize: '10px',
              color: '#64748b',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: '8px',
            }}
          >
            {t('agentRun.timeline.agentThoughtsLabel', { count: tokens.length })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {tokens.map(({ agent, text }) => (
              <AgentTokenBlock
                key={agent}
                agent={agent}
                text={text}
                color={AGENT_COLORS[agent] || '#94a3b8'}
                active={status === 'running'}
              />
            ))}
          </div>
        </div>
      )}

      {/* === Final result === */}
      {result && (
        <div style={{ padding: '20px' }}>
          {result.steps.length > 0 && (
            <details style={{ marginBottom: '16px' }}>
              <summary
                style={{
                  fontSize: '12px',
                  color: '#475569',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: '6px 0',
                  userSelect: 'none',
                }}
              >
                {t('agentRun.timeline.stepsDetailsLabel', { count: result.steps.length })}
              </summary>
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {result.steps.map((s, i) => (
                  <div
                    key={s.id || i}
                    style={{
                      padding: '8px 10px',
                      background: '#f8fafc',
                      borderRadius: '6px',
                      border: '1px solid #e2e8f0',
                      fontSize: '11px',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          padding: '2px 6px',
                          background: '#e0e7ff',
                          color: '#4338ca',
                          borderRadius: '4px',
                          fontWeight: 700,
                          fontSize: '10px',
                        }}
                      >
                        #{i + 1} {s.kind}
                      </span>
                      <span
                        style={{
                          color: s.status === 'done' ? '#10b981' : '#ef4444',
                          fontWeight: 600,
                          fontSize: '10px',
                        }}
                      >
                        {s.status}
                      </span>
                      {s.durationMs !== undefined && (
                        <span style={{ color: '#94a3b8', fontFamily: 'ui-monospace, monospace', fontSize: '10px' }}>
                          ⏱ {(s.durationMs / 1000).toFixed(1)}s
                        </span>
                      )}
                      {s.costUsd !== undefined && (
                        <span style={{ color: '#94a3b8', fontFamily: 'ui-monospace, monospace', fontSize: '10px' }}>
                          ${s.costUsd.toFixed(4)}
                        </span>
                      )}
                    </div>
                    <div style={{ color: '#475569' }}>{s.rationale}</div>
                    {s.outputSummary && (
                      <div style={{ marginTop: '4px', color: '#64748b', fontStyle: 'italic' }}>
                        → {s.outputSummary}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}

          <div
            style={{
              fontSize: '11px',
              color: '#64748b',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: '8px',
            }}
          >
            {t('agentRun.timeline.finalAnswerLabel')}
          </div>
          <div
            style={{
              padding: '16px',
              background: '#fafbfc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '13px',
              lineHeight: 1.7,
              color: '#0f172a',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {result.final_answer}
          </div>

          {result.references && result.references.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <div
                style={{
                  fontSize: '11px',
                  color: '#64748b',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: '8px',
                }}
              >
                {t('agentRun.timeline.referencesLabel', { count: result.references.length })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
                {result.references.map((r, i) => (
                  <div
                    key={`${r.materialId || i}-${i}`}
                    style={{
                      padding: '6px 10px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                    }}
                  >
                    <span style={{ color: '#6366f1', fontWeight: 700 }}>[{r.citeIndex || i + 1}]</span>{' '}
                    <span style={{ color: '#475569' }}>{r.snippet}</span>
                    {r.materialId && (
                      <span
                        style={{
                          color: '#94a3b8',
                          fontFamily: 'ui-monospace, monospace',
                          fontSize: '10px',
                          marginLeft: '6px',
                        }}
                      >
                        ({r.materialId?.slice(0, 18) || 'mat_?'}…)
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => void copyToClipboard(result.final_answer, 'md')}
              style={{
                padding: '8px 14px',
                background: '#f1f5f9',
                color: '#5a6478',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              {copied === 'md' ? t('agentRun.timeline.copied') : t('agentRun.timeline.copyMdBtn')}
            </button>
            <button
              onClick={() => void copyToClipboard(JSON.stringify(result.references, null, 2), 'ref')}
              style={{
                padding: '8px 14px',
                background: '#f1f5f9',
                color: '#5a6478',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              {copied === 'ref' ? t('agentRun.timeline.copied') : t('agentRun.timeline.copyRefBtn')}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes agent-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

// ============================================================================
// AgentTokenBlock — 可折叠的 agent token 块
// ============================================================================

function AgentTokenBlock({
  agent,
  text,
  color,
  active,
}: {
  agent: string
  text: string
  color: string
  active: boolean
}) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const preview = text.length > 120 ? text.slice(0, 120) + '…' : text
  const containerStyle: CSSProperties = {
    border: `1px solid ${color}33`,
    borderRadius: '8px',
    overflow: 'hidden',
  }
  return (
    <div style={containerStyle}>
      <button
        onClick={() => setExpanded((e) => !e)}
        style={{
          width: '100%',
          padding: '8px 12px',
          background: `${color}11`,
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {agent}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: '10px',
            color: '#94a3b8',
            fontFamily: 'ui-monospace, monospace',
          }}
        >
          {text.length.toLocaleString()} {t('agentRun.timeline.charsUnit')}
        </span>
        <span
          style={{
            fontSize: '10px',
            color: '#94a3b8',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        >
          ▼
        </span>
      </button>
      {expanded ? (
        <pre
          style={{
            margin: 0,
            padding: '10px 12px',
            fontSize: '11px',
            lineHeight: 1.6,
            color: '#0f172a',
            fontFamily: 'ui-monospace, monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: '320px',
            overflowY: 'auto',
            background: 'white',
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
                animation: 'agent-blink 1s steps(2, end) infinite',
              }}
            />
          )}
        </pre>
      ) : (
        <div style={{ padding: '8px 12px', fontSize: '11px', color: '#475569', background: 'white' }}>{preview}</div>
      )}
      <style>{`
        @keyframes agent-blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}

'use client'

/**
 * v2.4.0 — SessionHistoryDrawer
 *
 * 顶栏「Sessions」按钮 + 右侧滑出抽屉 + 详情模态框
 *
 * 数据流：
 * - GET /api/agent/sessions?limit=20  拉列表（轻量摘要）
 * - GET /api/agent/sessions/[id]      拉详情（含 steps / materials / finalAnswer）
 * - DELETE /api/agent/sessions/[id]   删除
 *
 * 视觉风格与 KnowledgeGraph 的"折叠 + 引用角标"对齐：轻量卡片 + status 徽章 + 相对时间。
 */

import { useEffect, useState, useCallback, type CSSProperties } from 'react'
import { useI18n } from '@/components/I18nProvider'

// ============================================================================
// Types
// ============================================================================

export interface SessionSummary {
  id: string
  goal: string
  locale: string
  status: 'running' | 'done' | 'failed' | 'cancelled'
  createdAt: number
  updatedAt: number
  stepCount: number
  materialCount: number
  hasFinalAnswer: boolean
  totalCostUsd?: number
}

export interface SessionStep {
  id: string
  index: number
  kind: string
  rationale: string
  query: string
  status: string
  outputSummary?: string
  durationMs?: number
  costUsd?: number
  error?: string
  startedAt: number
  finishedAt?: number
}

export interface SessionMaterial {
  id: string
  title: string
  source: string
  summary: string
  url?: string
  addedAt: number
}

export interface SessionDetail {
  id: string
  goal: string
  locale: string
  status: 'running' | 'done' | 'failed' | 'cancelled'
  createdAt: number
  updatedAt: number
  steps: SessionStep[]
  materials: SessionMaterial[]
  finalAnswer?: string
  references?: Array<{ materialId: string; snippet: string; citeIndex: number }>
  totalCostUsd?: number
}

const STATUS_COLOR: Record<string, string> = {
  running: '#3b82f6',
  done: '#10b981',
  failed: '#ef4444',
  cancelled: '#f59e0b',
}

// ============================================================================
// Main component
// ============================================================================

export function SessionHistoryButton() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch('/api/agent/sessions?limit=20')
      const data = (await resp.json()) as { success?: boolean; sessions?: SessionSummary[]; error?: string }
      if (data.success && Array.isArray(data.sessions)) {
        setSessions(data.sessions)
      } else {
        setError(data.error || t('agentRun.drawer.loadFailed'))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'network error')
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (open) {
      void refresh()
    }
  }, [open, refresh])

  const openDetail = useCallback(async (id: string) => {
    setActiveId(id)
    setDetail(null)
    setDetailLoading(true)
    try {
      const resp = await fetch(`/api/agent/sessions/${id}`)
      const data = (await resp.json()) as { success?: boolean; session?: SessionDetail; error?: string }
      if (data.success && data.session) {
        setDetail(data.session)
      } else {
        setDetail(null)
      }
    } catch {
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const deleteSession = useCallback(
    async (id: string) => {
      if (!window.confirm(t('agentRun.drawer.deleteConfirm'))) return
      try {
        const resp = await fetch(`/api/agent/sessions/${id}`, { method: 'DELETE' })
        const data = (await resp.json()) as { success?: boolean; error?: string }
        if (data.success) {
          setSessions((prev) => prev.filter((s) => s.id !== id))
          if (activeId === id) {
            setActiveId(null)
            setDetail(null)
          }
        } else {
          setError(data.error || t('agentRun.drawer.deleteFailed'))
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : t('agentRun.drawer.deleteFailed'))
      }
    },
    [activeId, t],
  )

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={t('agentRun.drawer.openBtn')}
        style={{
          position: 'fixed',
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          padding: '14px 8px',
          background: 'linear-gradient(180deg, #6366f1 0%, #06b6d4 100%)',
          color: 'white',
          border: 'none',
          borderRadius: '12px 0 0 12px',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: 700,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '6px',
          boxShadow: '-4px 0 12px rgba(99,102,241,0.24)',
          zIndex: 90,
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
          letterSpacing: '0.08em',
          transition: 'padding-right 0.2s ease, box-shadow 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.paddingRight = '12px'
          e.currentTarget.style.boxShadow = '-6px 0 18px rgba(99,102,241,0.36)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.paddingRight = '8px'
          e.currentTarget.style.boxShadow = '-4px 0 12px rgba(99,102,241,0.24)'
        }}
      >
        📂 {t('agentRun.drawer.openBtn')}
      </button>

      {/* Drawer */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            top: '60px',
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15,23,42,0.4)',
            zIndex: 9999,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '480px',
              maxWidth: '100%',
              height: '100%',
              background: 'white',
              boxShadow: '-8px 0 24px rgba(0,0,0,0.16)',
              display: 'flex',
              flexDirection: 'column',
              animation: 'session-slide-in 0.25s ease-out',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                📂 {t('agentRun.drawer.title')}
                {sessions.length > 0 && (
                  <span
                    style={{
                      background: '#6366f1',
                      color: 'white',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '999px',
                      minWidth: '20px',
                      textAlign: 'center',
                      lineHeight: 1.2,
                    }}
                  >
                    {sessions.length}
                  </span>
                )}
              </div>
              <button
                onClick={() => void refresh()}
                style={{
                  padding: '4px 10px',
                  background: '#f1f5f9',
                  color: '#5a6478',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 600,
                }}
              >
                ↻
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  padding: '4px 10px',
                  background: '#f1f5f9',
                  color: '#5a6478',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 600,
                  marginLeft: '6px',
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading && (
                <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                  {t('agentRun.drawer.loading')}
                </div>
              )}
              {error && (
                <div style={{ padding: '20px', color: '#ef4444', fontSize: '12px' }}>❌ {error}</div>
              )}
              {!loading && !error && sessions.length === 0 && (
                <div
                  style={{
                    padding: '40px 20px',
                    textAlign: 'center',
                    color: '#94a3b8',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📭</div>
                  {t('agentRun.drawer.empty')}
                </div>
              )}
              {!loading &&
                sessions.map((s) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    onClick={() => void openDetail(s.id)}
                    active={activeId === s.id}
                  />
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {activeId && (
        <div
          onClick={() => {
            setActiveId(null)
            setDetail(null)
          }}
          style={{
            position: 'fixed',
            top: '60px',
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15,23,42,0.5)',
            zIndex: 10001,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: '12px',
              maxWidth: '720px',
              width: '100%',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 16px 48px rgba(0,0,0,0.24)',
              animation: 'session-fade-in 0.2s ease-out',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '10px',
                    color: '#94a3b8',
                    fontFamily: 'ui-monospace, monospace',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {activeId}
                </div>
                <div
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#0f172a',
                    marginTop: '2px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={detail?.goal}
                >
                  {detail?.goal || t('agentRun.drawer.loading')}
                </div>
              </div>
              <button
                onClick={() => void deleteSession(activeId)}
                style={{
                  padding: '4px 10px',
                  background: '#fef2f2',
                  color: '#dc2626',
                  border: '1px solid #fecaca',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                🗑 {t('agentRun.drawer.deleteBtn')}
              </button>
              <button
                onClick={() => {
                  setActiveId(null)
                  setDetail(null)
                }}
                style={{
                  padding: '4px 10px',
                  background: '#f1f5f9',
                  color: '#5a6478',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {detailLoading && (
                <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '12px', padding: '20px' }}>
                  {t('agentRun.drawer.detailLoading')}
                </div>
              )}
              {detail && <SessionDetailView session={detail} />}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes session-slide-in {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes session-fade-in {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  )
}

// ============================================================================
// SessionRow — 抽屉列表单条
// ============================================================================

function SessionRow({
  session,
  onClick,
  active,
}: {
  session: SessionSummary
  onClick: () => void
  active: boolean
}) {
  const { t } = useI18n()
  const goalShort = session.goal.length > 60 ? session.goal.slice(0, 60) + '…' : session.goal
  const relative = (ts: number): string => {
    const diff = Date.now() - ts
    if (diff < 60_000) return t('agentRun.drawer.relativeTime.justNow')
    if (diff < 3_600_000)
      return t('agentRun.drawer.relativeTime.minutesAgo', { n: Math.floor(diff / 60_000) })
    if (diff < 86_400_000)
      return t('agentRun.drawer.relativeTime.hoursAgo', { n: Math.floor(diff / 3_600_000) })
    return t('agentRun.drawer.relativeTime.daysAgo', { n: Math.floor(diff / 86_400_000) })
  }
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        padding: '12px 20px',
        background: active ? '#eef2ff' : 'transparent',
        border: 'none',
        borderBottom: '1px solid #f1f5f9',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
        <span
          style={{
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: 700,
            color: 'white',
            background: STATUS_COLOR[session.status] || '#94a3b8',
          }}
        >
          {session.status}
        </span>
        {session.hasFinalAnswer && <span style={{ fontSize: '10px', color: '#7c3aed' }}>📝</span>}
        <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#94a3b8' }}>{relative(session.updatedAt)}</span>
      </div>
      <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 600, marginBottom: '4px' }}>{goalShort}</div>
      <div style={{ display: 'flex', gap: '12px', fontSize: '10px', color: '#64748b', flexWrap: 'wrap' }}>
        <span>
          📋 {session.stepCount} {t('agentRun.drawer.stepsUnit')}
        </span>
        <span>
          📚 {session.materialCount} {t('agentRun.drawer.sourcesUnit')}
        </span>
        {session.totalCostUsd !== undefined && (
          <span style={{ fontFamily: 'ui-monospace, monospace' }}>${session.totalCostUsd.toFixed(4)}</span>
        )}
        <span style={{ marginLeft: 'auto', color: '#cbd5e1', fontFamily: 'ui-monospace, monospace', fontSize: '9px' }}>
          {session.id.slice(0, 12)}…
        </span>
      </div>
    </button>
  )
}

// ============================================================================
// SessionDetailView — 模态框内容
// ============================================================================

function SessionDetailView({ session }: { session: SessionDetail }) {
  const { t } = useI18n()
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
        <Chip bg="#eef2ff" color="#4338ca">
          {t('agentRun.drawer.statusLabel', { status: session.status })}
        </Chip>
        <Chip bg="#f0f9ff" color="#0369a1">
          {t('agentRun.drawer.localeLabel', { locale: session.locale })}
        </Chip>
        {session.totalCostUsd !== undefined && (
          <Chip bg="#fef3c7" color="#92400e">
            ${session.totalCostUsd.toFixed(4)}
          </Chip>
        )}
        <Chip bg="#f0fdf4" color="#166534">
          {t('agentRun.drawer.stepsCount', { count: session.steps.length })}
        </Chip>
        <Chip bg="#fce7f3" color="#9d174d">
          {t('agentRun.drawer.materialsCount', { count: session.materials.length })}
        </Chip>
      </div>

      {session.steps.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <SectionLabel>{t('agentRun.drawer.detailStepsLabel')}</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {session.steps.map((s, i) => (
              <div
                key={s.id}
                style={{
                  padding: '8px 10px',
                  background: '#f8fafc',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    gap: '6px',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    marginBottom: '4px',
                  }}
                >
                  <span
                    style={{
                      background: '#e0e7ff',
                      color: '#4338ca',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 700,
                    }}
                  >
                    #{i + 1}
                  </span>
                  <span
                    style={{
                      background: '#ede9fe',
                      color: '#7c3aed',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 700,
                    }}
                  >
                    {s.kind}
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      color: s.status === 'done' ? '#10b981' : '#ef4444',
                      fontWeight: 600,
                    }}
                  >
                    {s.status}
                  </span>
                  {s.durationMs !== undefined && (
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                      ⏱ {(s.durationMs / 1000).toFixed(1)}s
                    </span>
                  )}
                  {s.costUsd !== undefined && (
                    <span style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'ui-monospace, monospace' }}>
                      ${s.costUsd.toFixed(4)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: '#475569' }}>{s.rationale}</div>
                {s.outputSummary && (
                  <div style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', marginTop: '4px' }}>
                    → {s.outputSummary}
                  </div>
                )}
                {s.error && (
                  <div style={{ fontSize: '10px', color: '#dc2626', marginTop: '4px' }}>❌ {s.error}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {session.materials.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <SectionLabel>{t('agentRun.drawer.detailMaterialsLabel')}</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {session.materials.map((m) => (
              <div
                key={m.id}
                style={{
                  padding: '8px 10px',
                  background: '#f8fafc',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>{m.title}</div>
                <div style={{ fontSize: '10px', color: '#94a3b8' }}>{m.source}</div>
                {m.url && (
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '10px', color: '#6366f1', textDecoration: 'underline' }}
                  >
                    {m.url}
                  </a>
                )}
                <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>{m.summary}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {session.finalAnswer && (
        <div>
          <SectionLabel>{t('agentRun.drawer.detailFinalAnswerLabel')}</SectionLabel>
          <div
            style={{
              padding: '12px',
              background: '#fafbfc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '12px',
              lineHeight: 1.6,
              color: '#0f172a',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {session.finalAnswer}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Small helpers
// ============================================================================

function Chip({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) {
  const style: CSSProperties = {
    background: bg,
    color,
    padding: '2px 8px',
    borderRadius: '999px',
    fontSize: '10px',
    fontWeight: 700,
  }
  return <span style={style}>{children}</span>
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: '11px',
        color: '#64748b',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: '6px',
      }}
    >
      {children}
    </div>
  )
}

'use client'

/**
 * CostTab — Cost & Token Dashboard(D6 实现 + D37 i18n 化)
 *
 * D37:主要文案走 i18n,Summary card labels 走 i18n(用户偏好)
 */

import { useState, useEffect, useCallback } from 'react'
import {
  loadCostHistory,
  clearCostHistory,
  summarizeCostHistory,
  type CostRun,
  type CostHistorySummary,
} from '@/lib/cost-history'
import { useI18n } from '@/components/I18nProvider'
import { btnPrimary, btnSecondary } from '@/lib/ui-styles'

// Agent 配色(与 AgentTimeline 保持一致)
const AGENT_COLORS: Record<string, string> = {
  Reader: '#06b6d4',
  Analyzer: '#0891b2',
  Terminology: '#0e7490',
  KnowledgeBuilder: '#7c3aed',
  Recommendation: '#8b5cf6',
  Export: '#db2777',
  Planner: '#6366f1',
  Reflection: '#7c3aed',
  Replan: '#6d28d9',
}

function agentColor(name: string): string {
  return AGENT_COLORS[name] || '#64748b'
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return `${n}`
}

function fmtCost(usd: number): string {
  if (usd === 0) return '$0'
  if (usd >= 1) return `$${usd.toFixed(2)}`
  if (usd >= 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(5)}`
}

function fmtDuration(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}min`
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms}ms`
}

function fmtTime(ts: number, locale: string): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function CostTab() {
  const { t, resolvedLocale } = useI18n()
  const [runs, setRuns] = useState<CostRun[]>([])
  const [summary, setSummary] = useState<CostHistorySummary>(() => summarizeCostHistory([]))
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    // D29 — loadCostHistory 改为 async + fetch /api/history/cost
    const list = await loadCostHistory()
    setRuns(list)
    setSummary(summarizeCostHistory(list))
    setLoaded(true)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleClear = async () => {
    if (!confirm(t('settings.cost.clearConfirm'))) return
    // D29 — clearCostHistory 改为 async
    await clearCostHistory()
    refresh()
  }

  if (!loaded) {
    return <div style={{ padding: '20px', color: '#94a3b8', textAlign: 'center' }}>{t('common.loading')}</div>
  }

  if (runs.length === 0) {
    return (
      <div
        style={{
          padding: '60px 24px',
          textAlign: 'center',
          background: 'white',
          borderRadius: '12px',
          border: '2px dashed #e2e8f0',
        }}
      >
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>📊</div>
        <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f1729', marginBottom: '6px' }}>
          {t('settings.cost.emptyTitle')}
        </div>
        <div style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.6, maxWidth: '400px', margin: '0 auto' }}>
          {t('settings.cost.emptyHint')}
        </div>
        <button onClick={refresh} style={{ ...btnPrimary, marginTop: '16px' }}>
          🔄 {t('settings.cost.refresh')}
        </button>
      </div>
    )
  }

  const maxAgentTokens = Math.max(1, ...summary.perAgent.map(a => a.totalTokens))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 操作栏 */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button onClick={refresh} style={{ ...btnSecondary, padding: '6px 12px', fontSize: '12px' }}>
          🔄 {t('settings.cost.refresh')}
        </button>
        <button
          onClick={handleClear}
          style={{
            ...btnSecondary,
            padding: '6px 12px',
            fontSize: '12px',
            color: '#dc2626',
            background: '#fef2f2',
          }}
        >
          🗑️ {t('settings.cost.clear')}
        </button>
      </div>

      {/* 1. Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
        <SummaryCard icon="🔄" label={t('settings.cost.totalRuns')} value={`${summary.totalRuns}`} hint={`${t('settings.cost.accumulated')} ${fmtDuration(summary.totalDurationMs)}`} />
        <SummaryCard icon="🪙" label={t('settings.cost.totalTokens')} value={fmtTokens(summary.totalTokens)} hint={`Prompt + Completion`} />
        <SummaryCard icon="💰" label={t('settings.cost.totalCost')} value={fmtCost(summary.totalCostUsd)} hint={t('settings.cost.usdEstimate')} accent="#047857" />
        <SummaryCard icon="📊" label={t('settings.cost.avgCostRun')} value={fmtCost(summary.avgCostPerRun)} hint={t('settings.cost.avgRunHint')} />
      </div>

      {/* 2. Per-Agent Breakdown */}
      <Section title={t('settings.cost.perAgentBreakdown')} icon="🧩">
        {summary.perAgent.length === 0 ? (
          <div style={{ padding: '16px', color: '#94a3b8', textAlign: 'center', fontSize: '12px' }}>
            {t('settings.cost.noAgentData')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr 90px 80px 60px',
                gap: '10px',
                padding: '0 12px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#94a3b8',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              <span>Agent</span>
              <span>{t('settings.cost.tokenDistribution')}</span>
              <span style={{ textAlign: 'right' }}>Tokens</span>
              <span style={{ textAlign: 'right' }}>Cost</span>
              <span style={{ textAlign: 'right' }}>Calls</span>
            </div>
            {summary.perAgent.map((a, i) => {
              const pct = Math.max(2, (a.totalTokens / maxAgentTokens) * 100)
              return (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '120px 1fr 90px 80px 60px',
                    gap: '10px',
                    padding: '10px 12px',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    alignItems: 'center',
                    fontSize: '12px',
                  }}
                >
                  <strong style={{ color: '#0f1729' }}>{a.agent}</strong>
                  <div
                    style={{
                      height: '8px',
                      background: 'white',
                      borderRadius: '999px',
                      overflow: 'hidden',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: agentColor(a.agent),
                        borderRadius: '999px',
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                  <span style={{ textAlign: 'right', color: '#475569', fontWeight: 600 }}>
                    {fmtTokens(a.totalTokens)}
                  </span>
                  <span style={{ textAlign: 'right', color: '#047857', fontWeight: 600 }}>
                    {fmtCost(a.costUsd)}
                  </span>
                  <span style={{ textAlign: 'right', color: '#94a3b8' }}>{a.calls}</span>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* 3. Recent Runs Table */}
      <Section title={`${t('settings.cost.recentRuns')} (${runs.length})`} icon="🕒">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <Th>{t('settings.cost.colTime')}</Th>
                <Th>{t('settings.cost.colTitle')}</Th>
                <Th>{t('settings.cost.colType')}</Th>
                <Th>{t('settings.cost.colComplexity')}</Th>
                <Th align="right">{t('settings.cost.colTokens')}</Th>
                <Th align="right">{t('settings.cost.colCost')}</Th>
                <Th align="right">{t('settings.cost.colDuration')}</Th>
                <Th>{t('settings.cost.colModel')}</Th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <Td style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>{fmtTime(r.timestamp, resolvedLocale)}</Td>
                  <Td style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.title || t('settings.cost.untitled')}
                  </Td>
                  <Td>
                    <span style={{ padding: '2px 6px', background: '#e0e7ff', color: '#4f46e5', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>
                      {r.inputType || '-'}
                    </span>
                  </Td>
                  <Td>
                    <span style={{ padding: '2px 6px', background: '#fef3c7', color: '#92400e', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>
                      {r.complexity || '-'}
                    </span>
                  </Td>
                  <Td align="right" style={{ color: '#475569', fontWeight: 600 }}>
                    {fmtTokens(r.totalUsage.totalTokens)}
                  </Td>
                  <Td align="right" style={{ color: '#047857', fontWeight: 600 }}>
                    {fmtCost(r.totalCostUsd)}
                  </Td>
                  <Td align="right" style={{ color: '#94a3b8' }}>
                    {fmtDuration(r.totalDurationMs)}
                  </Td>
                  <Td style={{ color: '#94a3b8', fontSize: '11px' }}>
                    {r.model || '-'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: string
  label: string
  value: string
  hint?: string
  accent?: string
}) {
  return (
    <div
      style={{
        padding: '16px',
        background: 'white',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: '22px', fontWeight: 800, color: accent || '#0f1729' }}>{value}</div>
      {hint && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{hint}</div>}
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'white',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        padding: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {icon} {title}
      </div>
      {children}
    </div>
  )
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      style={{
        padding: '8px 10px',
        textAlign: align,
        fontSize: '11px',
        fontWeight: 700,
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        borderBottom: '1px solid #e2e8f0',
      }}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  align = 'left',
  style,
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
  style?: React.CSSProperties
}) {
  return <td style={{ padding: '10px', textAlign: align, ...style }}>{children}</td>
}

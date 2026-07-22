'use client'

/**
 * CompareTab — D8 Compare Papers Tab
 *
 * 数据流：
 * 1. 用户生成 KC → page.tsx 自动 appendKCToHistory → localStorage
 * 2. 切换到 Compare Tab → 显示历史 KC 列表（含当前 KC）
 * 3. 用户从下拉选一个历史 KC（"另一篇论文"）→ 自动触发对比
 * 4. POST /api/research/compare-papers { kcA: currentKC, kcB: selectedKC }
 * 5. 渲染：6 维对比表 + SVG 雷达图 + 综合差异度 + 推荐阅读顺序
 *
 * UI 分区（Accordion 风格 — 用户偏好可折叠信息层级）：
 * - 顶部：选另一篇 KC 的下拉 + 触发按钮
 * - 中部：雷达图（6 维，A=蓝色，B=紫色）+ 综合差异度评分
 * - 下部：6 维对比详情表（可折叠）
 * - 底部：整体摘要 + 推荐阅读顺序
 *
 * Empty State：历史 KC < 2 时提示用户先生成第二篇论文
 */

import { useState, useEffect, useCallback } from 'react'
import { loadKCHistory, type KCHistoryEntry } from '@/lib/kc-history'
import type { KnowledgeCard } from '@/types/knowledge'
import type { CompareResult } from '@/types/compare'
import { btnPrimary, btnSecondary } from '@/lib/ui-styles'
import { useI18n } from '@/components/I18nProvider'

type TFn = (key: string, params?: Record<string, string | number>) => string

// ============================================================================
// Props
// ============================================================================

export interface CompareTabProps {
  /** 当前 KC（刚生成的） */
  currentKC: KnowledgeCard | null
  /** 当前 KC 的来源（URL 或 '用户输入'） */
  currentSource?: string
  /**
   * 预选历史 KC id（来自 SmartSuggestionBanner 的 "Compare Now" 跳转）
   * - D9 新增：当用户点击 banner 的 CTA，page.tsx 传入 preselectId
   *   CompareTab 收到后自动 setSelectedId + 自动触发对比
   * - 同 tab 切换时不变（已选则不重复触发）
   */
  preselectId?: string | null
  /**
   * 预选触发器（每次 preselectId 变化时自增）
   * - 传入相同 preselectId 但希望强制重新触发对比时使用
   * - 默认不依赖此字段（preselectId 从 null → 'xxx' 即触发）
   */
  preselectTrigger?: number
}

// ============================================================================
// 主组件
// ============================================================================

export function CompareTab({ currentKC, currentSource, preselectId, preselectTrigger }: CompareTabProps) {
  const { t } = useI18n()
  const [history, setHistory] = useState<KCHistoryEntry[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<CompareResult | null>(null)
  const [expandedDim, setExpandedDim] = useState<number | null>(0) // 默认展开第一个维度
  const [lastPreselectId, setLastPreselectId] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setHistory(loadKCHistory())
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // D9 Smart Suggestion — 收到 preselectId 时自动选择并触发对比
  useEffect(() => {
    if (!preselectId || !currentKC) return
    if (preselectId === lastPreselectId) return
    setLastPreselectId(preselectId)
    setSelectedId(preselectId)

    // 自动触发对比（预选后立即调 API）
    const selected = history.find(e => e.id === preselectId)
    if (!selected) {
      // 历史还没加载，等下次 effect 触发
      return
    }
    void triggerCompare(currentKC, selected)
  }, [preselectId, preselectTrigger, currentKC, history, lastPreselectId])

  const triggerCompare = useCallback(async (kcA: KnowledgeCard, selected: KCHistoryEntry) => {
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const resp = await fetch('/api/research/compare-papers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kcA,
          kcB: selected.knowledgeCard,
        }),
      })
      const data = await resp.json()
      if (!data.success) {
        setError(data.error || t('agent.compare.failed'))
        return
      }
      setResult(data.result)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('agent.compare.requestFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  const handleCompare = async () => {
    if (!currentKC || !selectedId) return
    const selected = history.find(e => e.id === selectedId)
    if (!selected) return
    await triggerCompare(currentKC, selected)
  }

  // 历史不足 1 篇 + 当前无 KC → Empty State
  if (!currentKC && history.length === 0) {
    return (
      <EmptyState
        title={t('agent.compare.empty1Title')}
        hint={t('agent.compare.empty1Hint')}
        onRefresh={refresh}
        refreshLabel={t('agent.compare.refresh')}
      />
    )
  }

  // 历史为空 + 只有当前 KC → 无法对比（需要至少 2 篇）
  if (currentKC && history.length === 0) {
    return (
      <EmptyState
        title={t('agent.compare.empty2Title')}
        hint={t('agent.compare.empty2Hint')}
        onRefresh={refresh}
        refreshLabel={t('agent.compare.refresh')}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 顶部：选另一篇 KC + 触发按钮 */}
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          padding: '16px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <div
          style={{
            fontSize: '12px',
            fontWeight: 700,
            color: '#475569',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '10px',
          }}
        >
          {t('agent.compare.header')}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', fontSize: '13px', color: '#5a6478' }}>
          <span style={{ color: '#0284c7', fontWeight: 700 }}>{t('agent.compare.aCurrent')}</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentKC?.title} {currentKC?.year ? `(${currentKC.year})` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', color: '#7c3aed', fontWeight: 700 }}>{t('agent.compare.b')}</span>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            style={{
              flex: 1,
              minWidth: '200px',
              padding: '8px 10px',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              fontSize: '13px',
              background: 'white',
              cursor: 'pointer',
            }}
          >
            <option value="">{t('agent.compare.selectHistory')}</option>
            {history
              .filter(e => e.title !== currentKC?.title) // 排除当前 KC（避免和自己对比）
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} {e.year ? `(${e.year})` : ''} · {e.field || 'N/A'} · {fmtRelativeTime(e.timestamp, t)}
                </option>
              ))}
          </select>
          <button
            onClick={handleCompare}
            disabled={!selectedId || loading}
            style={{
              ...btnPrimary,
              opacity: (!selectedId || loading) ? 0.5 : 1,
              cursor: (!selectedId || loading) ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? t('agent.compare.comparing') : t('agent.compare.startCompare')}
          </button>
          <button onClick={refresh} style={{ ...btnSecondary, padding: '6px 12px', fontSize: '12px' }}>
            {t('agent.compare.refresh')}
          </button>
        </div>
        {error && (
          <div style={{ marginTop: '8px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#991b1b', fontSize: '12px' }}>
            ❌ {error}
          </div>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div style={{ padding: '40px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔄</div>
          <div style={{ fontSize: '14px', color: '#64748b' }}>{t('agent.compare.loadingHint')}</div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{t('agent.compare.loadingHint2')}</div>
        </div>
      )}

      {/* 对比结果 */}
      {result && !loading && (
        <>
          {/* 综合差异度 + 推荐阅读顺序 */}
          <div
            style={{
              background: 'linear-gradient(135deg, #f0f9ff 0%, #faf5ff 100%)',
              borderRadius: '12px',
              padding: '16px',
              border: '1px solid #e0e7ff',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                  {t('agent.compare.overallScore')}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span style={{ fontSize: '36px', fontWeight: 800, color: getScoreColor(result.overallScore) }}>
                    {result.overallScore}
                  </span>
                  <span style={{ fontSize: '14px', color: '#94a3b8' }}>/ 100</span>
                  <span style={{ fontSize: '12px', color: getScoreColor(result.overallScore), marginLeft: '8px', fontWeight: 600 }}>
                    {getDiffLabel(result.overallScore, t)}
                  </span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                  {t('agent.compare.readingOrder')}
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#7c3aed' }}>
                  {getOrderLabel(result.recommendedOrder, t)}
                </div>
                {result.durationMs && (
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                    ⚡ {(result.durationMs / 1000).toFixed(1)}s · {result.model || 'LLM'}
                  </div>
                )}
              </div>
            </div>
            <div style={{ marginTop: '10px', padding: '10px 12px', background: 'white', borderRadius: '8px', fontSize: '13px', color: '#1e293b', lineHeight: 1.6 }}>
              💡 {result.summary}
            </div>
            {result.orderReason && (
              <div style={{ marginTop: '6px', fontSize: '12px', color: '#6d28d9', fontStyle: 'italic' }}>
                📖 {result.orderReason}
              </div>
            )}
          </div>

          {/* 雷达图 */}
          <RadarChart dimensions={result.dimensions} />

          {/* 6 维对比详情（Accordion 折叠） */}
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              padding: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
              {t('agent.compare.breakdown')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {result.dimensions.map((dim, i) => {
                const isOpen = expandedDim === i
                return (
                  <div
                    key={i}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      transition: 'border-color 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#c7d2fe')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#e2e8f0')}
                  >
                    <button
                      onClick={() => setExpandedDim(isOpen ? null : i)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        boxSizing: 'border-box',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                        <span style={{ fontSize: '14px' }}>{isOpen ? '▾' : '▸'}</span>
                        <strong style={{ fontSize: '13px', color: '#0f1729' }}>{dim.label}</strong>
                        {/* 双条对比 */}
                        <div style={{ flex: 1, display: 'flex', gap: '2px', maxWidth: '200px' }}>
                          <div style={{ flex: dim.scoreA, height: '6px', background: '#0284c7', borderRadius: '999px 0 0 999px' }} />
                          <div style={{ flex: dim.scoreB, height: '6px', background: '#7c3aed', borderRadius: '0 999px 999px 0' }} />
                        </div>
                        <span style={{ fontSize: '11px', color: '#0284c7', fontWeight: 700 }}>{dim.scoreA}</span>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>vs</span>
                        <span style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 700 }}>{dim.scoreB}</span>
                      </div>
                    </button>
                    {isOpen && (
                      <div style={{ padding: '10px 12px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', fontSize: '12px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '8px' }}>
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#0284c7', marginBottom: '4px' }}>{t('agent.compare.aPaper')}</div>
                            <div style={{ color: '#475569', lineHeight: 1.5 }}>{dim.valueA}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#7c3aed', marginBottom: '4px' }}>{t('agent.compare.bPaper')}</div>
                            <div style={{ color: '#475569', lineHeight: 1.5 }}>{dim.valueB}</div>
                          </div>
                        </div>
                        <div style={{ padding: '8px 10px', background: 'white', border: '1px dashed #cbd5e1', borderRadius: '6px', color: '#5a6478', fontStyle: 'italic' }}>
                          ⚡ {dim.diff}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================================
// SVG 雷达图（6 维，A=蓝色，B=紫色）
// ============================================================================

function RadarChart({ dimensions }: { dimensions: CompareResult['dimensions'] }) {
  const { t } = useI18n()
  const size = 320
  const center = size / 2
  const radius = 110
  const levels = 4 // 同心圆层数（25/50/75/100）

  // 6 个轴角度（从正上方开始，顺时针）
  const angleStep = (Math.PI * 2) / dimensions.length
  const startAngle = -Math.PI / 2 // 正上方

  // 计算每个维度的点坐标
  const getPoint = (score: number, idx: number) => {
    const angle = startAngle + idx * angleStep
    const r = (score / 100) * radius
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    }
  }

  // 多边形点字符串
  const pointsToString = (scores: number[]) => {
    return scores.map((s, i) => {
      const p = getPoint(s, i)
      return `${p.x},${p.y}`
    }).join(' ')
  }

  // 网格线（同心多边形）
  const gridLevels = Array.from({ length: levels }, (_, i) => (i + 1) * (100 / levels))

  // 轴标签位置
  const axisLabels = dimensions.map((dim, i) => {
    const angle = startAngle + i * angleStep
    const labelR = radius + 18
    return {
      x: center + labelR * Math.cos(angle),
      y: center + labelR * Math.sin(angle),
      label: dim.label,
      anchor: Math.abs(Math.cos(angle)) < 0.3 ? 'middle' : (Math.cos(angle) > 0 ? 'start' : 'end') as 'start' | 'middle' | 'end',
    }
  })

  const scoresA = dimensions.map(d => d.scoreA)
  const scoresB = dimensions.map(d => d.scoreB)

  return (
    <div
      style={{
        background: 'white',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        padding: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', alignSelf: 'flex-start' }}>
        {t('agent.compare.radar')}
      </div>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
        {/* 同心多边形网格 */}
        {gridLevels.map((lvl, i) => {
          const points = dimensions.map((_, idx) => {
            const angle = startAngle + idx * angleStep
            const r = (lvl / 100) * radius
            return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`
          }).join(' ')
          return (
            <polygon
              key={i}
              points={points}
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="1"
            />
          )
        })}

        {/* 6 条轴线 */}
        {dimensions.map((_, i) => {
          const angle = startAngle + i * angleStep
          return (
            <line
              key={i}
              x1={center}
              y1={center}
              x2={center + radius * Math.cos(angle)}
              y2={center + radius * Math.sin(angle)}
              stroke="#e2e8f0"
              strokeWidth="1"
            />
          )
        })}

        {/* B 多边形（紫色，先画在底层） */}
        <polygon
          points={pointsToString(scoresB)}
          fill="rgba(124, 58, 237, 0.18)"
          stroke="#7c3aed"
          strokeWidth="2"
        />

        {/* A 多边形（蓝色，画在上层） */}
        <polygon
          points={pointsToString(scoresA)}
          fill="rgba(2, 132, 199, 0.18)"
          stroke="#0284c7"
          strokeWidth="2"
        />

        {/* 顶点圆点 */}
        {scoresA.map((s, i) => {
          const p = getPoint(s, i)
          return <circle key={`a-${i}`} cx={p.x} cy={p.y} r="3" fill="#0284c7" />
        })}
        {scoresB.map((s, i) => {
          const p = getPoint(s, i)
          return <circle key={`b-${i}`} cx={p.x} cy={p.y} r="3" fill="#7c3aed" />
        })}

        {/* 轴标签 */}
        {axisLabels.map((l, i) => (
          <text
            key={i}
            x={l.x}
            y={l.y}
            textAnchor={l.anchor}
            dominantBaseline="middle"
            fontSize="10"
            fontWeight="600"
            fill="#475569"
          >
            {l.label}
          </text>
        ))}
      </svg>
      {/* 图例 */}
      <div style={{ display: 'flex', gap: '16px', marginTop: '4px', fontSize: '11px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '12px', height: '12px', background: 'rgba(2, 132, 199, 0.5)', border: '2px solid #0284c7', borderRadius: '2px' }} />
          <span style={{ color: '#0284c7', fontWeight: 700 }}>{t('agent.compare.aCurrent2')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '12px', height: '12px', background: 'rgba(124, 58, 237, 0.5)', border: '2px solid #7c3aed', borderRadius: '2px' }} />
          <span style={{ color: '#7c3aed', fontWeight: 700 }}>{t('agent.compare.bHistory')}</span>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Empty State
// ============================================================================

function EmptyState({ title, hint, onRefresh, refreshLabel }: { title: string; hint: string; onRefresh: () => void; refreshLabel: string }) {
  return (
    <div
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        background: 'white',
        borderRadius: '12px',
        border: '2px dashed #e2e8f0',
      }}
    >
      <div style={{ fontSize: '40px', marginBottom: '12px' }}>📊</div>
      <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f1729', marginBottom: '6px' }}>{title}</div>
      <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.6, maxWidth: '400px', margin: '0 auto' }}>{hint}</div>
      <button onClick={onRefresh} style={{ ...btnPrimary, marginTop: '16px' }}>{refreshLabel}</button>
    </div>
  )
}

// ============================================================================
// 辅助
// ============================================================================

function fmtRelativeTime(ts: number, t: TFn): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return t('agent.smartSuggestion.relativeTime.justNow')
  if (diff < 3600_000) return t('agent.smartSuggestion.relativeTime.minutesAgo', { n: Math.floor(diff / 60_000) })
  if (diff < 86400_000) return t('agent.smartSuggestion.relativeTime.hoursAgo', { n: Math.floor(diff / 3600_000) })
  return t('agent.smartSuggestion.relativeTime.daysAgo', { n: Math.floor(diff / 86400_000) })
}

function getScoreColor(score: number): string {
  if (score >= 75) return '#dc2626' // 高差异 = 红
  if (score >= 50) return '#f59e0b' // 中差异 = 黄
  if (score >= 25) return '#0284c7' // 低差异 = 蓝
  return '#16a34a'                   // 极低差异 = 绿
}

function getDiffLabel(score: number, t: TFn): string {
  if (score >= 75) return t('agent.compare.diffLabels.highly')
  if (score >= 50) return t('agent.compare.diffLabels.significantly')
  if (score >= 25) return t('agent.compare.diffLabels.moderately')
  return t('agent.compare.diffLabels.similar')
}

function getOrderLabel(order: CompareResult['recommendedOrder'], t: TFn): string {
  if (order === 'A_before_B') return t('agent.compare.orderLabels.aBeforeB')
  if (order === 'B_before_A') return t('agent.compare.orderLabels.bBeforeA')
  return t('agent.compare.orderLabels.parallel')
}

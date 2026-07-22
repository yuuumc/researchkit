'use client'

/**
 * AgentTimeline — Agent Pipeline 卡片（D6 从 app/page.tsx 抽出）
 *
 * v2.1 D6 升级：
 * - 顶部汇总条：Total tokens · Cost · Agents · Duration
 * - Execution Trace 每行加水平 token 条（按 Agent 配色）
 * - bar 末端显示 `1.2k tok · $0.0017`
 *
 * 设计原则：
 * - 不改变 v2.0 的视觉结构（评委看过的界面保持一致）
 * - 只在 Execution Trace 行追加 token 条 + 顶部汇总条
 * - perAgentUsage 为空时（旧数据 / Provider 未返回 usage）graceful 降级，不显示 token 条
 */

import { PipelineChip } from '@/components/ui/Chip'
import { useI18n } from '@/components/I18nProvider'
import type { AgentUsageSummary, ChatUsage } from '@/lib/usage-collector'

// ============================================================================
// Agent 配色 — 与 KnowledgeGraph / Pipeline 视觉一致
// ============================================================================

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

// ============================================================================
// 格式化辅助
// ============================================================================

function fmtTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return `${n}`
}

function fmtCost(usd: number): string {
  if (usd === 0) return '$0'
  if (usd >= 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(5)}`
}

function fmtDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms}ms`
}

// ============================================================================
// Props
// ============================================================================

export interface AgentTimelineProps {
  plan: any
  execution: any[]
  iterations: any[]
  totalIterations: number
  reflection: any
  toolCalls: any[]
  agentMeta: any
  expanded: boolean
  onToggleExpand: () => void
  // D6 新增
  perAgentUsage: AgentUsageSummary[]
  totalUsage: ChatUsage | null
  totalCostUsd: number | null
}

// ============================================================================
// Component
// ============================================================================

export default function AgentTimeline({
  plan,
  execution,
  iterations,
  totalIterations,
  reflection,
  toolCalls,
  agentMeta,
  expanded,
  onToggleExpand,
  perAgentUsage,
  totalUsage,
  totalCostUsd,
}: AgentTimelineProps) {
  const { t } = useI18n()
  // 按 agent 名建索引（用于 Execution Trace 行渲染 token 条）
  const usageByAgent = new Map<string, AgentUsageSummary>()
  for (const a of perAgentUsage) usageByAgent.set(a.agent, a)
  const maxAgentTokens = Math.max(1, ...perAgentUsage.map(a => a.totalTokens))

  const hasUsageData = perAgentUsage.length > 0 && !!totalUsage

  // 顶部汇总条数据
  const summaryTotalTokens = totalUsage?.totalTokens ?? 0
  const summaryCost = totalCostUsd ?? 0
  const summaryAgents = execution.length || 0
  const summaryDuration = agentMeta?.total_duration_ms ?? 0

  // 压缩单行的步骤清单（与 v2.0 保持一致）
  const pipelineSteps = [
    { label: t('agent.agentTimeline.pipelineSteps.read'), icon: '📖' },
    { label: t('agent.agentTimeline.pipelineSteps.analyze'), icon: '🔬' },
    { label: t('agent.agentTimeline.pipelineSteps.structure'), icon: '🏗️' },
    { label: t('agent.agentTimeline.pipelineSteps.reflect'), icon: '🔁' },
    { label: t('agent.agentTimeline.pipelineSteps.export'), icon: '📤' },
  ]

  return (
    <div style={{ background: 'white', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', marginBottom: '16px', border: '2px solid #e0e7ff', overflow: 'hidden' }}>
      {/* D6 顶部汇总条 — Total tokens · Cost · Agents · Duration */}
      {hasUsageData && (
        <div
          style={{
            padding: '10px 20px',
            background: 'linear-gradient(90deg, #f0fdf4 0%, #ecfeff 100%)',
            borderBottom: '1px solid #d1fae5',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            flexWrap: 'wrap',
            fontSize: '12px',
            fontWeight: 700,
            color: '#065f46',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span>🪙</span>
            <span>{t('agent.agentTimeline.summary.totalLabel')} <strong style={{ color: '#047857' }}>{fmtTokens(summaryTotalTokens)}</strong> {t('agent.agentTimeline.summary.tokensUnit')}</span>
          </span>
          <span style={{ color: '#a7f3d0' }}>·</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span>💰</span>
            <span>{t('agent.agentTimeline.summary.costLabel')} <strong style={{ color: '#047857' }}>{fmtCost(summaryCost)}</strong></span>
          </span>
          <span style={{ color: '#a7f3d0' }}>·</span>
          <span>{t('agent.agentTimeline.summary.agents', { count: summaryAgents })}</span>
          {summaryDuration > 0 && (
            <>
              <span style={{ color: '#a7f3d0' }}>·</span>
              <span>{t('agent.agentTimeline.summary.duration', { duration: fmtDuration(summaryDuration) })}</span>
            </>
          )}
        </div>
      )}

      {/* 折叠头部 — 单行步骤状态 */}
      <button
        onClick={onToggleExpand}
        style={{
          width: '100%',
          padding: '16px 20px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '16px' }}>🧠</span>
          <span style={{ fontSize: '11px', fontWeight: 800, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: '4px' }}>{t('agent.agentTimeline.pipeline')}</span>
          {pipelineSteps.map((step, i) => {
            const stepExec = execution.find((e: any) => e.agent?.toLowerCase().includes(step.label.toLowerCase().slice(0, 4)) || e.agent === step.label)
            const success = stepExec ? stepExec.success : true
            return (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '3px 8px', background: success ? '#f0fdf4' : '#fef2f2', color: success ? '#065f46' : '#991b1b', borderRadius: '999px', fontSize: '11px', fontWeight: 700 }}>
                <span style={{ fontSize: '10px' }}>{success ? '✓' : '✗'}</span>
                {step.label}
              </span>
            )
          })}
          {iterations.length > 0 && (
            <span style={{ padding: '3px 8px', background: '#fef3c7', color: '#92400e', borderRadius: '999px', fontSize: '11px', fontWeight: 700 }}>
              {t('agent.agentTimeline.iter', { count: totalIterations })}
            </span>
          )}
          {toolCalls.length > 0 && (
            <span style={{ padding: '3px 8px', background: '#fefce8', color: '#854d0e', borderRadius: '999px', fontSize: '11px', fontWeight: 700 }}>
              {t('agent.agentTimeline.tools', { count: toolCalls.length })}
            </span>
          )}
          {agentMeta?.total_duration_ms && (
            <span style={{ padding: '3px 8px', background: '#f1f5f9', color: '#5a6478', borderRadius: '999px', fontSize: '11px', fontWeight: 700 }}>
              {t('agent.agentTimeline.durationMs', { ms: agentMeta.total_duration_ms })}
            </span>
          )}
        </div>
        <span style={{ color: '#94a3b8', fontSize: '14px', fontWeight: 700, flexShrink: 0 }}>{expanded ? '▾' : '▸'}</span>
      </button>

      {/* 展开内容 */}
      {expanded && (
        <div style={{ padding: '0 20px 20px', borderTop: '1px solid #e2e8f0' }}>
          {/* Planner rationale */}
          <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '12px', padding: '14px 16px', marginTop: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#6d28d9', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('agent.agentTimeline.plannerReasoning')}</div>
            <div style={{ fontSize: '14px', color: '#1e1b4b', lineHeight: 1.6 }}>{plan.rationale}</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
              {plan.input_type && <PipelineChip>{t('agent.agentTimeline.chips.type', { value: plan.input_type })}</PipelineChip>}
              {plan.complexity && <PipelineChip>{t('agent.agentTimeline.chips.complexity', { value: plan.complexity })}</PipelineChip>}
              {agentMeta?.planner_duration_ms && <PipelineChip>{t('agent.agentTimeline.chips.plannerMs', { ms: agentMeta.planner_duration_ms })}</PipelineChip>}
              {agentMeta?.reflection_duration_ms && <PipelineChip>{t('agent.agentTimeline.chips.reflectionMs', { ms: agentMeta.reflection_duration_ms })}</PipelineChip>}
              {agentMeta?.total_duration_ms && <PipelineChip>{t('agent.agentTimeline.chips.totalMs', { ms: agentMeta.total_duration_ms })}</PipelineChip>}
            </div>
          </div>

          {/* Reflection Loop */}
          {iterations && iterations.length > 0 && (
            <div style={{ marginTop: '14px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#7c3aed', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {t('agent.agentTimeline.reflectionLoop', {
                  count: totalIterations,
                  iterWord: totalIterations === 1 ? t('agent.agentTimeline.iterationWord') : t('agent.agentTimeline.iterationsWord'),
                })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {iterations.map((iter: any, i: number) => (
                  <div key={i} style={{ padding: '12px 14px', background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', padding: '2px 8px', background: '#7c3aed', color: 'white', borderRadius: '4px', fontWeight: 700 }}>{t('agent.agentTimeline.iterBadge', { n: iter.iteration })}</span>
                      <span style={{ fontSize: '14px' }}>{iter.reflection?.satisfied ? '✅' : '⚠️'}</span>
                      <strong style={{ fontSize: '12px', color: iter.reflection?.satisfied ? '#065f46' : '#92400e' }}>
                        {iter.reflection?.satisfied ? t('agent.agentTimeline.satisfied') : t('agent.agentTimeline.needsWork')}
                      </strong>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>{t('agent.agentTimeline.reflectMs', { ms: iter.reflection_duration_ms })}</span>
                      {iter.replan_duration_ms && (
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>{t('agent.agentTimeline.replanMs', { ms: iter.replan_duration_ms })}</span>
                      )}
                      {iter.supplementary_duration_ms && (
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>{t('agent.agentTimeline.execMs', { ms: iter.supplementary_duration_ms })}</span>
                      )}
                    </div>
                    {iter.reflection?.reasoning && (
                      <div style={{ fontSize: '12px', color: '#5a6478', marginBottom: '6px', fontStyle: 'italic' }}>
                        💭 {iter.reflection.reasoning}
                      </div>
                    )}
                    {iter.reflection?.missing && iter.reflection.missing.length > 0 && (
                      <div style={{ fontSize: '11px', color: '#92400e', marginBottom: '6px' }}>
                        {t('agent.agentTimeline.missing', { items: iter.reflection.missing.join(', ') })}
                      </div>
                    )}
                    {iter.replan && (
                      <div style={{ marginTop: '6px', padding: '8px 10px', background: 'white', border: '1px dashed #c4b5fd', borderRadius: '6px' }}>
                        <div style={{ fontSize: '11px', color: '#6d28d9', fontWeight: 600 }}>
                          {iter.replan.should_continue ? t('agent.agentTimeline.replanCont') : t('agent.agentTimeline.replanStop')}
                        </div>
                        <div style={{ fontSize: '11px', color: '#5a6478', marginTop: '2px' }}>{iter.replan.reasoning}</div>
                        {iter.replan.supplementary_steps && iter.replan.supplementary_steps.length > 0 && (
                          <div style={{ marginTop: '4px', fontSize: '11px' }}>
                            <strong style={{ color: '#7c3aed' }}>{t('agent.agentTimeline.supplementarySteps')}</strong>
                            {iter.replan.supplementary_steps.map((s: any, j: number) => (
                              <span key={j} style={{ display: 'inline-block', margin: '2px 4px 2px 0', padding: '2px 6px', background: '#ede9fe', color: '#5b21b6', borderRadius: '4px', fontSize: '10px' }}>
                                {s.agent}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {iter.supplementary_execution && iter.supplementary_execution.length > 0 && (
                      <div style={{ marginTop: '6px' }}>
                        {iter.supplementary_execution.map((s: any, j: number) => (
                          <div key={j} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: s.success ? '#f0fdf4' : '#fef2f2', border: `1px solid ${s.success ? '#bbf7d0' : '#fecaca'}`, borderRadius: '4px', marginBottom: '3px', fontSize: '11px' }}>
                            <span>{s.success ? '✓' : '✗'}</span>
                            <strong>{s.step.agent}</strong>
                            <span style={{ color: '#94a3b8' }}>{s.duration_ms}ms</span>
                            <span style={{ color: '#5a6478', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.step.reason}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Execution Trace — D6 每行加 token 条 */}
          <div style={{ marginTop: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('agent.agentTimeline.executionTrace')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {execution.map((step: any, i: number) => {
                const usage = usageByAgent.get(step.agent)
                const tokenPct = usage ? Math.max(2, (usage.totalTokens / maxAgentTokens) * 100) : 0
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: step.success ? '#f0fdf4' : '#fef2f2', border: `1px solid ${step.success ? '#bbf7d0' : '#fecaca'}`, borderRadius: '10px' }}>
                    <span style={{ fontSize: '16px' }}>{step.success ? '✓' : '✗'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <strong style={{ color: '#0f1729', fontSize: '14px' }}>{step.agent}</strong>
                        <span style={{ fontSize: '11px', padding: '2px 6px', background: '#e0e7ff', color: '#4f46e5', borderRadius: '4px' }}>{t('agent.agentTimeline.group', { n: step.parallel_group })}</span>
                        {!step.required && <span style={{ fontSize: '11px', padding: '2px 6px', background: '#fef3c7', color: '#92400e', borderRadius: '4px' }}>{t('agent.agentTimeline.optional')}</span>}
                      </div>
                      {step.reason && <div style={{ fontSize: '12px', color: '#5a6478', marginTop: '2px' }}>{step.reason}</div>}

                      {/* D6 token 条 — 仅在有 usage 数据时显示 */}
                      {usage && (
                        <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ flex: 1, height: '6px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
                            <div
                              style={{
                                width: `${tokenPct}%`,
                                height: '100%',
                                background: agentColor(step.agent),
                                borderRadius: '999px',
                                transition: 'width 0.4s ease',
                              }}
                            />
                          </div>
                          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {t('agent.agentTimeline.tokCost', { tokens: fmtTokens(usage.totalTokens), cost: fmtCost(usage.costUsd) })}
                          </span>
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>{step.duration_ms}ms</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Reflection result */}
          {reflection && (
            <div style={{ marginTop: '12px', background: reflection.satisfied ? '#ecfdf5' : '#fffbeb', border: `1px solid ${reflection.satisfied ? '#a7f3d0' : '#fde68a'}`, borderRadius: '12px', padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>{reflection.satisfied ? '🎯' : '⚠️'}</span>
                <strong style={{ fontSize: '13px', color: reflection.satisfied ? '#065f46' : '#92400e' }}>{reflection.satisfied ? t('agent.agentTimeline.reflectionSatisfied') : t('agent.agentTimeline.reflectionNeedsMore')}</strong>
              </div>
              {reflection.reasoning && <div style={{ fontSize: '12px', color: '#5a6478', marginTop: '4px' }}>{reflection.reasoning}</div>}
              {reflection.missing && reflection.missing.length > 0 && (
                <div style={{ fontSize: '12px', color: '#92400e', marginTop: '4px' }}>{t('agent.agentTimeline.missing', { items: reflection.missing.join(', ') })}</div>
              )}
            </div>
          )}

          {/* MCP Tool Calls */}
          {toolCalls && toolCalls.length > 0 && (
            <div style={{ marginTop: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('agent.agentTimeline.mcpToolCalls')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {toolCalls.map((tc: any, i: number) => (
                  <div key={i} style={{ padding: '12px 14px', background: tc.success ? '#fefce8' : '#fef2f2', border: `1px solid ${tc.success ? '#fde68a' : '#fecaca'}`, borderRadius: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '14px' }}>{tc.success ? '✓' : '✗'}</span>
                      <code style={{ padding: '2px 8px', background: '#1e293b', color: '#fbbf24', borderRadius: '4px', fontSize: '12px', fontWeight: 700 }}>{tc.tool}</code>
                      <span style={{ fontSize: '11px', padding: '2px 6px', background: '#e0e7ff', color: '#4f46e5', borderRadius: '4px' }}>{t('agent.agentTimeline.byAgent', { agent: tc.called_by })}</span>
                      <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>{tc.duration_ms}ms</span>
                    </div>
                    {tc.input && Object.keys(tc.input).length > 0 && (
                      <div style={{ fontSize: '11px', color: '#5a6478', marginTop: '6px', fontFamily: 'ui-monospace, monospace', background: '#f8fafc', padding: '6px 8px', borderRadius: '4px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {(() => {
                          const preview: any = {}
                          Object.entries(tc.input).slice(0, 4).forEach(([k, v]: [string, any]) => {
                            preview[k] = typeof v === 'string' && v.length > 60 ? v.substring(0, 60) + '...' : v
                          })
                          return JSON.stringify(preview)
                        })()}
                      </div>
                    )}
                    {tc.output && (
                      <div style={{ fontSize: '11px', color: tc.success ? '#065f46' : '#991b1b', marginTop: '4px' }}>
                        → {typeof tc.output === 'object' ? JSON.stringify(tc.output).substring(0, 120) : String(tc.output).substring(0, 120)}
                        {JSON.stringify(tc.output).length > 120 ? '...' : ''}
                      </div>
                    )}
                    {tc.error && (
                      <div style={{ fontSize: '11px', color: '#991b1b', marginTop: '4px' }}>→ Error: {tc.error}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Meta footer — D6 末尾追加 Total tokens / Total cost */}
          {agentMeta && (
            <div style={{ marginTop: '12px', fontSize: '11px', color: '#94a3b8', display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span>{t('agent.agentTimeline.meta.planner', { ms: agentMeta.planner_duration_ms })}</span>
              <span>{t('agent.agentTimeline.meta.reflect', { iter: agentMeta.reflection_iterations, ms: agentMeta.reflection_duration_ms })}</span>
              {agentMeta.supplementary_steps_executed > 0 && (
                <span>{t('agent.agentTimeline.meta.supp', { steps: agentMeta.supplementary_steps_executed })}</span>
              )}
              {agentMeta.tool_calls_count > 0 && (
                <span>{t('agent.agentTimeline.meta.tools', { ok: agentMeta.tool_calls_succeeded, total: agentMeta.tool_calls_count, ms: agentMeta.tool_call_duration_ms })}</span>
              )}
              <span>{t('agent.agentTimeline.meta.total', { ms: agentMeta.total_duration_ms })}</span>
              {hasUsageData && (
                <>
                  <span style={{ color: '#047857', fontWeight: 700 }}>🪙 {fmtTokens(summaryTotalTokens)} tok</span>
                  <span style={{ color: '#047857', fontWeight: 700 }}>💰 {fmtCost(summaryCost)}</span>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

'use client'

/**
 * ExplainKC — D11 Explain Agent
 *
 * UI 设计（基于用户偏好：卡片 + 可折叠 + 互动动画）：
 * - 卡片头部：🎯 Explain 标题
 * - 受众选择器：4 个图标按钮（高中/工程师/研究员/PM）
 * - Generate 按钮（主按钮，hover 时变色）
 * - 结果展示：
 *   - Summary (粗体大字)
 *   - Why It Matters (蓝色卡片)
 *   - Core Concept (类比解释，紫色卡片)
 *   - Actionable (绿色卡片)
 *   - Questions (3 个追问 chips)
 *   - Tags (该受众关心的标签)
 *
 * 交互细节：
 * - 切换受众 → 清空之前的解释
 * - 加载中：骨架屏 + 跳动 dots
 * - 错误：红色提示 + Retry
 * - 受众切换有动画
 * - 结果保存到组件 state（不持久化，刷新即清空 — v2.3 升级 localStorage）
 *
 * 数据流：
 * 1. 用户选择 audience + 点 Generate
 * 2. 调用 POST /api/research/explain-kc { kc, audience }
 * 3. 后端按受众生成结构化解释
 * 4. 前端按区块渲染
 */

import { useState } from 'react'
import type { KnowledgeCard } from '@/types/knowledge'
import { btnPrimary } from '@/lib/ui-styles'
import { useI18n } from '@/components/I18nProvider'

// ============================================================================
// 类型
// ============================================================================

type Audience = 'high_school' | 'software_engineer' | 'researcher' | 'product_manager'

interface Explanation {
  summary: string
  whyItMatters: string
  coreConcept: string
  actionable: string
  questions: string[]
  tags: string[]
}

interface ExplainResponse {
  success: boolean
  audience: Audience
  audienceLabel: string
  audienceIcon: string
  explanation: Explanation
  model: string
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  durationMs?: number
  error?: string
}

export interface ExplainKCProps {
  knowledgeCard: KnowledgeCard
}

// ============================================================================
// 受众配置 — label/desc 通过 i18n 在渲染时解析
// ============================================================================

const AUDIENCE_OPTIONS: Array<{
  id: Audience
  localeKey: string
  icon: string
  color: string
}> = [
  { id: 'high_school', localeKey: 'highschool', icon: '🎓', color: '#10b981' },
  { id: 'software_engineer', localeKey: 'engineer', icon: '👨‍💻', color: '#0ea5e9' },
  { id: 'researcher', localeKey: 'researcher', icon: '🔬', color: '#8b5cf6' },
  { id: 'product_manager', localeKey: 'pm', icon: '💼', color: '#f59e0b' },
]

// ============================================================================
// 主组件
// ============================================================================

export function ExplainKC({ knowledgeCard }: ExplainKCProps) {
  const { t } = useI18n()
  const [selectedAudience, setSelectedAudience] = useState<Audience | null>(null)
  const [explanation, setExplanation] = useState<Explanation | null>(null)
  const [activeAudience, setActiveAudience] = useState<{ label: string; icon: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usage, setUsage] = useState<{ tokens: number; durationMs: number; model: string } | null>(null)

  // 当前选中受众对应的本地化 label/desc
  const audienceLabel = (id: Audience | null): string => {
    if (!id) return ''
    const opt = AUDIENCE_OPTIONS.find(o => o.id === id)
    if (!opt) return ''
    return t(`agent.explainKC.audienceOptions.${opt.localeKey}.label`)
  }

  const handleGenerate = async (audience: Audience) => {
    if (loading) return
    setSelectedAudience(audience)
    setLoading(true)
    setError(null)
    setExplanation(null)
    setUsage(null)

    try {
      const resp = await fetch('/api/research/explain-kc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kc: knowledgeCard,
          audience,
        }),
      })
      const data: ExplainResponse = await resp.json()

      if (!data.success) {
        setError(data.error || t('agent.explainKC.generateFailed'))
        return
      }

      setExplanation(data.explanation)
      setActiveAudience({ label: data.audienceLabel, icon: data.audienceIcon })
      if (data.usage) {
        setUsage({
          tokens: data.usage.totalTokens || 0,
          durationMs: data.durationMs || 0,
          model: data.model,
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('agent.explainKC.networkError'))
    } finally {
      setLoading(false)
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
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          background: 'linear-gradient(135deg, #fef3c7 0%, #fed7aa 100%)',
          borderBottom: '1px solid #fde68a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>🎯</span>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#92400e' }}>
              {t('agent.explainKC.headerTitle')}
            </div>
            <div style={{ fontSize: '11px', color: '#b45309', marginTop: '2px' }}>
              {t('agent.explainKC.headerHint')}
            </div>
          </div>
        </div>
        {usage && (
          <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#92400e' }}>
            <span style={{ background: 'rgba(255,255,255,0.6)', padding: '2px 8px', borderRadius: '999px', fontWeight: 600 }}>
              📊 {usage.tokens.toLocaleString()} tokens
            </span>
            <span style={{ background: 'rgba(255,255,255,0.6)', padding: '2px 8px', borderRadius: '999px', fontWeight: 600 }}>
              ⚡ {(usage.durationMs / 1000).toFixed(1)}s
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '16px' }}>
        {/* Audience selector */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '6px', fontWeight: 600 }}>
            {t('agent.explainKC.selectAudience')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
            {AUDIENCE_OPTIONS.map((opt) => {
              const isSelected = selectedAudience === opt.id
              const label = t(`agent.explainKC.audienceOptions.${opt.localeKey}.label`)
              const desc = t(`agent.explainKC.audienceOptions.${opt.localeKey}.desc`)
              return (
                <button
                  key={opt.id}
                  onClick={() => !loading && setSelectedAudience(opt.id)}
                  disabled={loading}
                  style={{
                    padding: '10px 12px',
                    background: isSelected ? `${opt.color}15` : 'white',
                    border: `2px solid ${isSelected ? opt.color : '#e2e8f0'}`,
                    borderRadius: '8px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                    opacity: loading && !isSelected ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!loading && !isSelected) {
                      e.currentTarget.style.borderColor = opt.color
                      e.currentTarget.style.transform = 'translateY(-1px)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!loading && !isSelected) {
                      e.currentTarget.style.borderColor = '#e2e8f0'
                      e.currentTarget.style.transform = 'translateY(0)'
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '18px' }}>{opt.icon}</span>
                    <span style={{ fontWeight: 700, color: isSelected ? opt.color : '#0f1729', fontSize: '13px' }}>
                      {label}
                    </span>
                    {isSelected && <span style={{ marginLeft: 'auto', color: opt.color, fontSize: '14px' }}>✓</span>}
                  </div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
                    {desc}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={() => selectedAudience && handleGenerate(selectedAudience)}
          disabled={!selectedAudience || loading}
          style={{
            ...btnPrimary,
            width: '100%',
            padding: '10px',
            opacity: (!selectedAudience || loading) ? 0.5 : 1,
            cursor: (!selectedAudience || loading) ? 'not-allowed' : 'pointer',
            fontSize: '13px',
            fontWeight: 700,
            marginBottom: '12px',
            background: selectedAudience
              ? `linear-gradient(135deg, ${AUDIENCE_OPTIONS.find(o => o.id === selectedAudience)?.color || '#0284c7'} 0%, #06b6d4 100%)`
              : undefined,
          }}
        >
          {loading
            ? t('agent.explainKC.generating')
            : t('agent.explainKC.regenerateBtn', { audience: audienceLabel(selectedAudience) })}
        </button>

        {/* Loading state */}
        {loading && <LoadingSkeleton />}

        {/* Error state */}
        {error && !loading && (
          <div
            style={{
              padding: '12px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#991b1b',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '12px',
            }}
          >
            <span>❌</span>
            <span style={{ flex: 1 }}>{error}</span>
            {selectedAudience && (
              <button
                onClick={() => handleGenerate(selectedAudience)}
                style={{
                  padding: '4px 10px',
                  background: '#991b1b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                {t('agent.explainKC.retry')}
              </button>
            )}
          </div>
        )}

        {/* Result */}
        {!loading && explanation && activeAudience && (
          <ExplanationView
            explanation={explanation}
            audienceLabel={activeAudience.label}
            audienceIcon={activeAudience.icon}
          />
        )}
      </div>
    </div>
  )
}

// ============================================================================
// 结果展示
// ============================================================================

function ExplanationView({
  explanation,
  audienceLabel,
  audienceIcon,
}: {
  explanation: Explanation
  audienceLabel: string
  audienceIcon: string
}) {
  const { t } = useI18n()
  return (
    <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
      {/* Audience badge */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          background: '#f0f9ff',
          border: '1px solid #bae6fd',
          borderRadius: '999px',
          fontSize: '11px',
          color: '#0369a1',
          fontWeight: 600,
          marginBottom: '12px',
        }}
      >
        <span>{audienceIcon}</span>
        <span>{t('agent.explainKC.forAudience', { audience: audienceLabel })}</span>
      </div>

      {/* Summary */}
      <div
        style={{
          padding: '12px 14px',
          background: 'linear-gradient(135deg, #faf5ff 0%, #fdf4ff 100%)',
          border: '1px solid #e9d5ff',
          borderRadius: '8px',
          marginBottom: '10px',
        }}
      >
        <div style={{ fontSize: '10px', color: '#7c3aed', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {t('agent.explainKC.oneSentence')}
        </div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e1b4b', lineHeight: 1.5 }}>
          {explanation.summary}
        </div>
      </div>

      {/* Why It Matters */}
      {explanation.whyItMatters && (
        <SectionBlock
          icon="💡"
          label={t('agent.explainKC.whyMatters')}
          color="#0ea5e9"
          bg="#f0f9ff"
          borderColor="#bae6fd"
        >
          <p style={{ margin: 0, fontSize: '13px', color: '#0c4a6e', lineHeight: 1.6 }}>
            {explanation.whyItMatters}
          </p>
        </SectionBlock>
      )}

      {/* Core Concept */}
      {explanation.coreConcept && (
        <SectionBlock
          icon="🧠"
          label={t('agent.explainKC.coreConcept')}
          color="#8b5cf6"
          bg="#faf5ff"
          borderColor="#e9d5ff"
        >
          <p style={{ margin: 0, fontSize: '13px', color: '#5b21b6', lineHeight: 1.7 }}>
            {explanation.coreConcept}
          </p>
        </SectionBlock>
      )}

      {/* Actionable */}
      {explanation.actionable && (
        <SectionBlock
          icon="✅"
          label={t('agent.explainKC.actionable')}
          color="#10b981"
          bg="#ecfdf5"
          borderColor="#a7f3d0"
        >
          <p style={{ margin: 0, fontSize: '13px', color: '#065f46', lineHeight: 1.6, fontWeight: 600 }}>
            {explanation.actionable}
          </p>
        </SectionBlock>
      )}

      {/* Questions */}
      {explanation.questions && explanation.questions.length > 0 && (
        <div style={{ marginBottom: '10px' }}>
          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {t('agent.explainKC.shouldAsk')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {explanation.questions.map((q, i) => (
              <div
                key={i}
                style={{
                  padding: '8px 12px',
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#92400e',
                  display: 'flex',
                  gap: '6px',
                }}
              >
                <span style={{ color: '#f59e0b', fontWeight: 700 }}>{i + 1}.</span>
                <span style={{ flex: 1 }}>{q}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {explanation.tags && explanation.tags.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '12px' }}>
          {explanation.tags.map((tag, i) => (
            <span
              key={i}
              style={{
                padding: '3px 8px',
                background: '#f1f5f9',
                color: '#475569',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 600,
              }}
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      ` }} />
    </div>
  )
}

function SectionBlock({
  icon,
  label,
  color,
  bg,
  borderColor,
  children,
}: {
  icon: string
  label: string
  color: string
  bg: string
  borderColor: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        padding: '10px 12px',
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: '8px',
        marginBottom: '10px',
      }}
    >
      <div style={{ fontSize: '10px', color, fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {icon} {label}
      </div>
      {children}
    </div>
  )
}

// ============================================================================
// 加载骨架屏
// ============================================================================

function LoadingSkeleton() {
  const { t } = useI18n()
  return (
    <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
      <div
        style={{
          height: '60px',
          background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite',
          borderRadius: '8px',
          marginBottom: '10px',
        }}
      />
      <div
        style={{
          height: '80px',
          background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite',
          borderRadius: '8px',
          marginBottom: '10px',
        }}
      />
      <div
        style={{
          height: '40px',
          background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite',
          borderRadius: '8px',
        }}
      />
      <div style={{ textAlign: 'center', padding: '12px', fontSize: '11px', color: '#94a3b8' }}>
        {t('agent.explainKC.loading')}
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      ` }} />
    </div>
  )
}

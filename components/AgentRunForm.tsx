'use client'

/**
 * v2.4.0 — AgentRunForm
 *
 * 从 /playground/agent 抽出的表单组件：
 *   - goal 文本框
 *   - locale 下拉
 *   - max_steps 滑块
 *   - Advanced 折叠（session_id）
 *   - Run 按钮
 *
 * 与主 UI 集成：
 *   - 走 i18n（useI18n），不再硬编码中文
 *   - defaultLocale 可由 page.tsx 从 userPrefs.outputLocale 注入
 *   - 提交后通过 onRun 回调触发 AgentRunTimeline 运行
 */

import { useState, type CSSProperties } from 'react'
import { useI18n } from '@/components/I18nProvider'

export interface AgentRunFormParams {
  goal: string
  locale: string
  maxSteps: number
  sessionId?: string
}

export interface AgentRunFormProps {
  /** 默认 locale，从 userPrefs.outputLocale 解析后注入（'auto' → resolvedLocale） */
  defaultLocale?: string
  /** 默认 maxSteps */
  defaultMaxSteps?: number
  /** 提交后触发 AgentRunTimeline 重跑 */
  onRun: (params: AgentRunFormParams) => void
  /** 受控：是否禁用表单（运行中） */
  disabled?: boolean
  /** 可选：外部传入的初始 goal（如从首页 input 同步） */
  initialGoal?: string
}

const LOCALE_OPTIONS = [
  { value: 'en', label: 'en' },
  { value: 'zh-CN', label: 'zh-CN' },
] as const

export function AgentRunForm({
  defaultLocale = 'en',
  defaultMaxSteps = 4,
  onRun,
  disabled = false,
  initialGoal = '',
}: AgentRunFormProps) {
  const { t } = useI18n()
  const [goal, setGoal] = useState(initialGoal)
  const [locale, setLocale] = useState(defaultLocale)
  const [maxSteps, setMaxSteps] = useState(defaultMaxSteps)
  const [sessionId, setSessionId] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const valid = goal.length >= 5

  const handleSubmit = () => {
    if (!valid || disabled) return
    onRun({ goal: goal.trim(), locale, maxSteps, sessionId: sessionId || undefined })
  }

  return (
    <div
      style={{
        background: 'white',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        padding: '16px',
        marginBottom: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      {/* Goal */}
      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>
          🎯 {t('agentRun.form.goalLabel')}
        </label>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={4}
          placeholder={t('agentRun.form.goalPlaceholder')}
          style={textareaStyle}
        />
        <div
          style={{
            fontSize: '10px',
            color: valid ? '#94a3b8' : '#ef4444',
            marginTop: '2px',
            textAlign: 'right',
          }}
        >
          {t('agentRun.form.charCount', { n: goal.length })}
        </div>
      </div>

      {/* Locale + MaxSteps + Advanced */}
      <div style={{ ...gridStyle, marginBottom: '12px' }}>
        <div>
          <label style={smallLabelStyle}>
            {t('agentRun.form.localeLabel')}
          </label>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            style={selectStyle}
          >
            {LOCALE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={smallLabelStyle}>
            {t('agentRun.form.maxStepsLabel')}:{' '}
            <span style={{ color: '#7c3aed', fontFamily: 'ui-monospace, monospace' }}>
              {maxSteps}
            </span>
          </label>
          <input
            type="range"
            min="1"
            max="6"
            step="1"
            value={maxSteps}
            onChange={(e) => setMaxSteps(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>
        <button
          type="button"
          onClick={() => setShowAdvanced((s) => !s)}
          style={advancedBtnStyle}
        >
          {showAdvanced ? '▼' : '▶'} {t('agentRun.form.advancedBtn')}
        </button>
      </div>

      {/* Advanced: Session ID */}
      {showAdvanced && (
        <div
          style={{
            marginBottom: '12px',
            padding: '10px',
            background: '#f8fafc',
            borderRadius: '6px',
          }}
        >
          <label style={smallLabelStyle}>
            {t('agentRun.form.sessionIdLabel')}
          </label>
          <input
            type="text"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            placeholder={t('agentRun.form.sessionIdPlaceholder')}
            style={inputStyle}
          />
        </div>
      )}

      {/* Run button */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!valid || disabled}
        style={{
          ...runBtnStyle,
          opacity: !valid || disabled ? 0.5 : 1,
          cursor: !valid || disabled ? 'not-allowed' : 'pointer',
          background: valid && !disabled
            ? 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)'
            : '#cbd5e1',
        }}
      >
        {disabled ? `⏳ ${t('agentRun.form.running')}` : `🚀 ${t('agentRun.form.runBtn')}`}
      </button>

      {/* Warning */}
      <div
        style={{
          marginTop: '12px',
          padding: '10px 12px',
          background: '#fff7ed',
          border: '1px solid #fed7aa',
          borderRadius: '6px',
          fontSize: '11px',
          color: '#9a3412',
          lineHeight: 1.5,
        }}
      >
        ⚠️ <strong>{t('agentRun.form.warn')}</strong>
      </div>
    </div>
  )
}

// ============================================================================
// Styles
// ============================================================================

const labelStyle: CSSProperties = {
  fontSize: '11px',
  color: '#475569',
  fontWeight: 700,
  display: 'block',
  marginBottom: '4px',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const smallLabelStyle: CSSProperties = {
  fontSize: '11px',
  color: '#475569',
  fontWeight: 600,
  display: 'block',
  marginBottom: '4px',
}

const textareaStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #cbd5e1',
  borderRadius: '8px',
  fontSize: '13px',
  fontFamily: 'inherit',
  outline: 'none',
  resize: 'vertical',
  boxSizing: 'border-box',
}

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr auto',
  gap: '12px',
  alignItems: 'end',
}

const selectStyle: CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  fontSize: '12px',
  background: 'white',
  outline: 'none',
  boxSizing: 'border-box',
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  fontSize: '12px',
  fontFamily: 'ui-monospace, monospace',
  boxSizing: 'border-box',
  outline: 'none',
}

const advancedBtnStyle: CSSProperties = {
  padding: '6px 10px',
  background: '#f1f5f9',
  color: '#5a6478',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '11px',
  fontWeight: 600,
  whiteSpace: 'nowrap',
}

const runBtnStyle: CSSProperties = {
  width: '100%',
  padding: '10px',
  fontSize: '13px',
  fontWeight: 700,
  color: 'white',
  border: 'none',
  borderRadius: '8px',
}

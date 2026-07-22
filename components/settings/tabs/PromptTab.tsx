'use client'

import { useState, useEffect } from 'react'
import type { AgentName, ProjectExtension } from '@/core/prompt/types'
import {
  getAllProjectExtensionsClient,
  saveProjectExtensionClient,
  clearProjectExtensionClient,
  clearAllProjectExtensionsClient,
} from '@/lib/prompt-extensions'
import { useI18n } from '@/components/I18nProvider'
import { btnPrimary, btnSecondary, inputStyle } from '@/lib/ui-styles'

/**
 * PromptTab — Agent Prompt 扩展配置(D37 i18n 化)
 *
 * D4 v2.1 实现三层 Prompt 架构的可视化编辑
 * D37:主要文案走 i18n,Agent 名称保留英文(代码标识符)
 */

const AGENTS: Array<{ name: AgentName; descKey: string }> = [
  { name: 'Reader', descKey: 'settings.prompt.agentReader' },
  { name: 'Analyzer', descKey: 'settings.prompt.agentAnalyzer' },
  { name: 'Terminology', descKey: 'settings.prompt.agentTerminology' },
  { name: 'Recommendation', descKey: 'settings.prompt.agentRecommendation' },
  { name: 'Planner', descKey: 'settings.prompt.agentPlanner' },
  { name: 'Reflection', descKey: 'settings.prompt.agentReflection' },
  { name: 'Replan', descKey: 'settings.prompt.agentReplan' },
  { name: 'KnowledgeBuilder', descKey: 'settings.prompt.agentKnowledgeBuilder' },
]

export function PromptTab() {
  const { t } = useI18n()
  const [extensions, setExtensions] = useState<Partial<Record<AgentName, ProjectExtension>>>({})
  const [selected, setSelected] = useState<AgentName>('Reader')
  const [draft, setDraft] = useState<ProjectExtension>({ appendInstructions: '', outputPreferences: '' })
  const [saved, setSaved] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const all = getAllProjectExtensionsClient()
    setExtensions(all)
    const current = all[selected] || { appendInstructions: '', outputPreferences: '' }
    setDraft(current)
    setLoaded(true)
  }, [])

  const handleSelect = (agent: AgentName) => {
    setSelected(agent)
    const current = extensions[agent] || { appendInstructions: '', outputPreferences: '' }
    setDraft(current)
    setSaved(false)
  }

  const handleDraftChange = (field: keyof ProjectExtension, value: string) => {
    setDraft(prev => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  const handleSave = () => {
    const trimmed: ProjectExtension = {
      appendInstructions: draft.appendInstructions?.trim() || undefined,
      outputPreferences: draft.outputPreferences?.trim() || undefined,
    }
    if (!trimmed.appendInstructions && !trimmed.outputPreferences) {
      clearProjectExtensionClient(selected)
      const next = { ...extensions }
      delete next[selected]
      setExtensions(next)
    } else {
      saveProjectExtensionClient(selected, trimmed)
      setExtensions(prev => ({ ...prev, [selected]: { ...trimmed, updatedAt: Date.now() } }))
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const handleClearAgent = () => {
    if (!confirm(t('settings.prompt.clearAgentConfirm', { agent: selected }))) return
    clearProjectExtensionClient(selected)
    const next = { ...extensions }
    delete next[selected]
    setExtensions(next)
    setDraft({ appendInstructions: '', outputPreferences: '' })
  }

  const handleClearAll = () => {
    if (!confirm(t('settings.prompt.clearAllConfirm'))) return
    clearAllProjectExtensionsClient()
    setExtensions({})
    setDraft({ appendInstructions: '', outputPreferences: '' })
  }

  if (!loaded) {
    return <div style={{ padding: '24px', color: '#64748b' }}>{t('common.loading')}</div>
  }

  const activeCount = Object.keys(extensions).length

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '20px' }}>
      {/* 左侧 Agent 列表 */}
      <aside
        style={{
          background: 'white',
          borderRadius: '16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
          padding: '12px',
          height: 'fit-content',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 12px',
            marginBottom: '8px',
            fontSize: '11px',
            color: '#64748b',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          <span>AGENTS</span>
          <span style={{
            padding: '2px 8px',
            background: activeCount > 0 ? '#dcfce7' : '#f1f5f9',
            color: activeCount > 0 ? '#22c55e' : '#94a3b8',
            borderRadius: '10px',
            fontSize: '11px',
          }}>
            {activeCount} {t('settings.prompt.activeCount')}
          </span>
        </div>
        {AGENTS.map(agent => {
          const hasExt = Boolean(extensions[agent.name])
          const isSelected = selected === agent.name
          return (
            <button
              key={agent.name}
              onClick={() => handleSelect(agent.name)}
              style={{
                display: 'block',
                width: '100%',
                padding: '10px 12px',
                background: isSelected ? '#6366f1' : 'transparent',
                color: isSelected ? 'white' : '#0f1729',
                border: 'none',
                borderRadius: '8px',
                textAlign: 'left',
                cursor: 'pointer',
                marginBottom: '2px',
                fontSize: '13px',
                fontWeight: isSelected ? 600 : 500,
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={e => {
                if (!isSelected) e.currentTarget.style.background = '#f1f5f9'
              }}
              onMouseLeave={e => {
                if (!isSelected) e.currentTarget.style.background = 'transparent'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {hasExt && <span style={{ color: isSelected ? 'white' : '#22c55e', fontSize: '10px' }}>●</span>}
                <span>{agent.name}</span>
              </div>
              {!isSelected && (
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                  {t(agent.descKey)}
                </div>
              )}
            </button>
          )
        })}
        <button
          onClick={handleClearAll}
          disabled={activeCount === 0}
          style={{
            display: 'block',
            width: '100%',
            marginTop: '12px',
            padding: '10px',
            background: activeCount === 0 ? '#f8fafc' : '#fee2e2',
            color: activeCount === 0 ? '#94a3b8' : '#dc2626',
            border: 'none',
            borderRadius: '8px',
            cursor: activeCount === 0 ? 'not-allowed' : 'pointer',
            fontSize: '12px',
            fontWeight: 600,
            minHeight: '40px',
          }}
        >
          {t('settings.prompt.clearAll')}
        </button>
      </aside>

      {/* 右侧编辑表单 */}
      <section
        style={{
          background: 'white',
          borderRadius: '16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
          padding: '28px',
        }}
      >
        <header style={{ marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #e2e8f2' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f1729' }}>
            {selected} <span style={{ color: '#6366f1', fontSize: '14px', fontWeight: 500 }}>— Project Extension</span>
          </h3>
          <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#64748b' }}>
            {t(AGENTS.find(a => a.name === selected)?.descKey || 'settings.prompt.agentReader')}
          </p>
        </header>

        {/* 架构说明 */}
        <div
          style={{
            padding: '12px 14px',
            background: '#f8fafc',
            borderRadius: '10px',
            marginBottom: '24px',
            fontSize: '12px',
            color: '#475569',
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '4px', color: '#0f1729' }}>
            🔒 {t('settings.prompt.architectureTitle')}
          </div>
          <div>
            <strong>System</strong> ({t('settings.general.readonly')}) → <strong>Project Extension</strong> ({t('settings.prompt.thisPage')}) → <strong>User Extension</strong> ({t('settings.general.oneshot')})
          </div>
          <div style={{ marginTop: '4px', color: '#64748b' }}>
            {t('settings.prompt.architectureHint')}
          </div>
        </div>

        {/* Append Instructions */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f1729', marginBottom: '6px' }}>
            {t('settings.prompt.appendInstructions')}
          </label>
          <textarea
            value={draft.appendInstructions || ''}
            onChange={e => handleDraftChange('appendInstructions', e.target.value)}
            placeholder={t('settings.prompt.appendPlaceholder')}
            rows={6}
            style={{
              ...inputStyle,
              minHeight: '120px',
              padding: '10px 12px',
              fontFamily: 'ui-monospace, monospace',
              fontSize: '12px',
              resize: 'vertical',
              lineHeight: 1.5,
            }}
          />
          <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#64748b' }}>
            {t('settings.prompt.appendHint')}
          </p>
        </div>

        {/* Output Preferences */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f1729', marginBottom: '6px' }}>
            {t('settings.prompt.outputPreferences')}
          </label>
          <textarea
            value={draft.outputPreferences || ''}
            onChange={e => handleDraftChange('outputPreferences', e.target.value)}
            placeholder={t('settings.prompt.outputPlaceholder')}
            rows={4}
            style={{
              ...inputStyle,
              minHeight: '80px',
              padding: '10px 12px',
              fontFamily: 'ui-monospace, monospace',
              fontSize: '12px',
              resize: 'vertical',
              lineHeight: 1.5,
            }}
          />
          <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#64748b' }}>
            {t('settings.prompt.outputHint')}
          </p>
        </div>

        {/* 按钮组 */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '28px', flexWrap: 'wrap' }}>
          <button onClick={handleSave} style={{ ...btnPrimary, minHeight: '40px' }}>
            {t('settings.prompt.save')}
          </button>
          <button
            onClick={handleClearAgent}
            disabled={!extensions[selected]}
            style={{
              ...btnSecondary,
              opacity: extensions[selected] ? 1 : 0.5,
              cursor: extensions[selected] ? 'pointer' : 'not-allowed',
              minHeight: '40px',
              color: extensions[selected] ? '#dc2626' : undefined,
              background: extensions[selected] ? '#fee2e2' : undefined,
              borderColor: extensions[selected] ? '#fecaca' : undefined,
            }}
          >
            {t('settings.prompt.clearAgent')}
          </button>
        </div>

        {saved && (
          <div
            style={{
              marginTop: '20px',
              padding: '12px 16px',
              borderRadius: '10px',
              background: '#dbeafe',
              border: '1px solid #3b82f6',
              fontSize: '13px',
              color: '#1e40af',
            }}
          >
            ✅ {t('settings.prompt.savedDetail', { agent: selected })}
          </div>
        )}

        {extensions[selected]?.updatedAt && (
          <div style={{ marginTop: '16px', fontSize: '11px', color: '#94a3b8' }}>
            {t('settings.general.lastUpdated')}: {new Date(extensions[selected]!.updatedAt!).toLocaleString('zh-CN')}
          </div>
        )}
      </section>
    </div>
  )
}

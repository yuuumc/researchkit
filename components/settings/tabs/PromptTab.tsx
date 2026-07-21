'use client'

import { useState, useEffect } from 'react'
import type { AgentName, ProjectExtension } from '@/core/prompt/types'
import {
  getAllProjectExtensionsClient,
  saveProjectExtensionClient,
  clearProjectExtensionClient,
  clearAllProjectExtensionsClient,
} from '@/lib/prompt-extensions'
import { btnPrimary, btnSecondary, inputStyle } from '@/lib/ui-styles'

/**
 * PromptTab — Agent Prompt 扩展配置
 *
 * D4 v2.1 实现三层 Prompt 架构的可视化编辑：
 * - System 🔒 ResearchKit 内置（只读，本 Tab 不展示）
 * - Project ➕ 项目级扩展（本 Tab 主要功能）
 * - User ➕ 单次扩展（D5+ 在生成知识卡时通过 UI 传入）
 *
 * UI：
 * - 左侧 Agent 列表（Reader/Analyzer/Terminology/Recommendation/Planner/Reflection/Replan/KnowledgeBuilder）
 * - 右侧选中 Agent 的 Project Extension 表单
 *   - Append Instructions（追加在 System prompt 末尾的规则）
 *   - Output Preferences（输出偏好，如"避免第一人称"）
 * - "保存"按钮 + "清除该 Agent"按钮
 * - 顶部"清除所有扩展"按钮
 */

const AGENTS: Array<{ name: AgentName; label: string; desc: string }> = [
  { name: 'Reader', label: 'Reader', desc: '阅读理解 + 价值判断' },
  { name: 'Analyzer', label: 'Analyzer', desc: '深度分析（按 schema 提取字段）' },
  { name: 'Terminology', label: 'Terminology', desc: '术语图谱 + 依赖 DAG' },
  { name: 'Recommendation', label: 'Recommendation', desc: '4 类 intent 推荐阅读' },
  { name: 'Planner', label: 'Planner', desc: '规划执行步骤' },
  { name: 'Reflection', label: 'Reflection', desc: '评估 Knowledge Card 完整度' },
  { name: 'Replan', label: 'Replan', desc: '根据 Reflection 反馈重新规划' },
  { name: 'KnowledgeBuilder', label: 'KnowledgeBuilder', desc: '汇总成最终知识卡' },
]

export function PromptTab() {
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
    // 空内容时清除该 Agent 的扩展
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
    if (!confirm(`确定要清除 ${selected} 的 Project Extension 吗？`)) return
    clearProjectExtensionClient(selected)
    const next = { ...extensions }
    delete next[selected]
    setExtensions(next)
    setDraft({ appendInstructions: '', outputPreferences: '' })
  }

  const handleClearAll = () => {
    if (!confirm('确定要清除所有 Agent 的 Project Extension 吗？此操作不可撤销。')) return
    clearAllProjectExtensionsClient()
    setExtensions({})
    setDraft({ appendInstructions: '', outputPreferences: '' })
  }

  if (!loaded) {
    return <div style={{ padding: '24px', color: '#64748b' }}>Loading...</div>
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
            {activeCount} active
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
                <span>{agent.label}</span>
              </div>
              {!isSelected && (
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                  {agent.desc}
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
            padding: '8px',
            background: activeCount === 0 ? '#f8fafc' : '#fee2e2',
            color: activeCount === 0 ? '#94a3b8' : '#dc2626',
            border: 'none',
            borderRadius: '8px',
            cursor: activeCount === 0 ? 'not-allowed' : 'pointer',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          清除所有扩展
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
            {AGENTS.find(a => a.name === selected)?.desc}
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
            🔒 三层 Prompt 架构
          </div>
          <div>
            <strong>System</strong>（只读） → <strong>Project Extension</strong>（本页配置） → <strong>User Extension</strong>（单次调用）
          </div>
          <div style={{ marginTop: '4px', color: '#64748b' }}>
            Project Extension 会追加在 System prompt 末尾，不会覆盖内置规则。所有该 Agent 的 LLM 调用都会自动注入。
          </div>
        </div>

        {/* Append Instructions */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f1729', marginBottom: '6px' }}>
            Append Instructions
          </label>
          <textarea
            value={draft.appendInstructions || ''}
            onChange={e => handleDraftChange('appendInstructions', e.target.value)}
            placeholder="追加在 System prompt 末尾的规则。例如：&#10;- 重点抓 datasets 字段（本项目关注数据集对比）&#10;- limitations 至少 3 条&#10;- 引用 GB/T 7714 格式"
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
            附加规则（追加在 System prompt 末尾，不会替换内置规则）
          </p>
        </div>

        {/* Output Preferences */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f1729', marginBottom: '6px' }}>
            Output Preferences
          </label>
          <textarea
            value={draft.outputPreferences || ''}
            onChange={e => handleDraftChange('outputPreferences', e.target.value)}
            placeholder="输出偏好（影响所有 LLM 调用）。例如：&#10;- 使用被动语态&#10;- 避免第一人称&#10;- 中文输出，术语保留英文原文"
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
            通用输出偏好（语言、风格、术语等）
          </p>
        </div>

        {/* 按钮组 */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '28px', flexWrap: 'wrap' }}>
          <button onClick={handleSave} style={btnPrimary}>
            💾 保存扩展
          </button>
          <button
            onClick={handleClearAgent}
            disabled={!extensions[selected]}
            style={{
              ...btnSecondary,
              opacity: extensions[selected] ? 1 : 0.5,
              cursor: extensions[selected] ? 'pointer' : 'not-allowed',
            }}
          >
            🗑 清除该 Agent
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
            ✅ {selected} 的 Project Extension 已保存，下次该 Agent 调用时生效
          </div>
        )}

        {extensions[selected]?.updatedAt && (
          <div style={{ marginTop: '16px', fontSize: '11px', color: '#94a3b8' }}>
            最后更新：{new Date(extensions[selected]!.updatedAt!).toLocaleString('zh-CN')}
          </div>
        )}
      </section>
    </div>
  )
}

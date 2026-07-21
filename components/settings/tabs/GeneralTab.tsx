'use client'

/**
 * GeneralTab — 通用设置（D5 实现）
 *
 * 功能：
 * - Prompt Preset：5 角色切换（Academic / Beginner / Developer / Researcher / Product Manager）
 *   影响：所有 Agent 的 PromptBuilder 会注入对应 persona 指令
 * - Output Language：'auto'（跟随源语言）或强制 zh-CN / en-US / ja-JP / ko-KR / fr-FR / de-DE / es-ES
 *   影响：所有 Agent 的 targetLocale（用户偏好 'auto' 时跟随源语言，否则强制覆盖）
 *
 * 存储：localStorage + cookie（让 server side 通过 next/headers 读取）
 */

import { useState, useEffect } from 'react'
import { PRESET_LIST, DEFAULT_PRESET, type PresetId } from '@/config/presets'
import type { Locale } from '@/lib/locale'
import {
  getUserPreferencesClient,
  saveUserPreferencesClient,
  clearUserPreferencesClient,
  DEFAULT_USER_PREFERENCES,
  type UserPreferences,
} from '@/lib/user-preferences'
import { btnPrimary, btnSecondary, inputStyle } from '@/lib/ui-styles'

const LOCALE_OPTIONS: Array<{ value: 'auto' | Locale; label: string; hint: string }> = [
  { value: 'auto', label: 'Auto — 跟随源语言', hint: '默认行为：检测输入语言并跟随（v2.0 兼容）' },
  { value: 'zh-CN', label: '中文 (简体)', hint: '强制中文输出（即使输入是英文）' },
  { value: 'en-US', label: 'English (US)', hint: '强制英文输出' },
  { value: 'ja-JP', label: '日本語', hint: '强制日文输出' },
  { value: 'ko-KR', label: '한국어', hint: '强制韩文输出' },
  { value: 'fr-FR', label: 'Français', hint: '强制法文输出' },
  { value: 'de-DE', label: 'Deutsch', hint: '强制德文输出' },
  { value: 'es-ES', label: 'Español', hint: '强制西班牙文输出' },
]

export function GeneralTab() {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_USER_PREFERENCES)
  const [loaded, setLoaded] = useState(false)
  const [usingDefault, setUsingDefault] = useState(true)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const saved = getUserPreferencesClient()
    setPrefs(saved)
    // 判断是否使用默认值（preset=academic && outputLocale=auto）
    setUsingDefault(
      saved.preset === DEFAULT_PRESET && saved.outputLocale === 'auto'
    )
    setLoaded(true)
  }, [])

  const handlePresetChange = (preset: PresetId) => {
    setPrefs(prev => ({ ...prev, preset }))
    setSaved(false)
  }

  const handleLocaleChange = (locale: 'auto' | Locale) => {
    setPrefs(prev => ({ ...prev, outputLocale: locale }))
    setSaved(false)
  }

  const handleSave = () => {
    saveUserPreferencesClient(prefs)
    setUsingDefault(
      prefs.preset === DEFAULT_PRESET && prefs.outputLocale === 'auto'
    )
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleReset = () => {
    if (!confirm('确定要重置为默认设置吗？Preset=Academic，Output Language=Auto。')) return
    clearUserPreferencesClient()
    setPrefs(DEFAULT_USER_PREFERENCES)
    setUsingDefault(true)
    setSaved(false)
  }

  if (!loaded) {
    return <div style={{ padding: '24px', color: '#64748b' }}>Loading...</div>
  }

  const selectedPreset = PRESET_LIST.find(p => p.id === prefs.preset) || PRESET_LIST[0]

  return (
    <div
      style={{
        background: 'white',
        borderRadius: '16px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
        padding: '28px',
      }}
    >
      {/* 状态条 */}
      <div
        style={{
          padding: '12px 16px',
          borderRadius: '10px',
          marginBottom: '24px',
          background: usingDefault ? '#f1f5f9' : '#dcfce7',
          border: `1px solid ${usingDefault ? '#cbd5e1' : '#22c55e'}`,
          fontSize: '13px',
          color: '#1e293b',
        }}
      >
        {usingDefault ? (
          <>
            ⚙️ <strong>当前使用默认设置</strong>
            （Preset=Academic，Output Language=Auto 跟随源语言）
          </>
        ) : (
          <>
            ✅ <strong>当前使用自定义偏好</strong>
            （Preset={selectedPreset.label}，Output Language={prefs.outputLocale}）
          </>
        )}
      </div>

      {/* 架构说明 */}
      <div
        style={{
          padding: '14px 16px',
          background: '#f8fafc',
          borderRadius: '10px',
          marginBottom: '28px',
          fontSize: '12px',
          color: '#475569',
          lineHeight: 1.6,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: '6px', color: '#0f1729' }}>
          🎭 Prompt 三层架构 + 角色注入
        </div>
        <div>
          <strong>System</strong>（只读内置） → <strong>Preset Persona</strong>（本页选择的角色） → <strong>Project</strong>（Prompt Tab） → <strong>User</strong>（单次扩展）
        </div>
        <div style={{ marginTop: '4px', color: '#64748b' }}>
          Preset 会注入到所有 Agent 的 prompt 中，影响 LLM 视角和输出风格；Output Language 会强制覆盖最终输出语言。
        </div>
      </div>

      {/* Preset 选择 */}
      <Field label="Prompt Preset" hint="选择生成知识卡时 LLM 使用的角色视角">
        <select
          value={prefs.preset}
          onChange={e => handlePresetChange(e.target.value as PresetId)}
          style={{
            ...inputStyle,
            minHeight: 'auto',
            padding: '10px 12px',
            cursor: 'pointer',
          }}
        >
          {PRESET_LIST.map(preset => (
            <option key={preset.id} value={preset.id}>
              {preset.icon} {preset.label} — {preset.description}
            </option>
          ))}
        </select>
      </Field>

      {/* 选中 preset 详情 */}
      <div
        style={{
          marginTop: '-8px',
          marginBottom: '24px',
          padding: '14px 16px',
          background: '#faf5ff',
          borderRadius: '10px',
          border: '1px solid #e9d5ff',
          fontSize: '12px',
          color: '#4c1d95',
          lineHeight: 1.6,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: '6px' }}>
          {selectedPreset.icon} {selectedPreset.label} Persona
        </div>
        <pre
          style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'ui-monospace, monospace',
            fontSize: '11px',
            color: '#6b21a8',
          }}
        >
{selectedPreset.persona}
        </pre>
      </div>

      {/* Output Language */}
      <Field label="Output Language" hint="所有 Agent 输出知识卡时使用的语言">
        <select
          value={prefs.outputLocale}
          onChange={e => handleLocaleChange(e.target.value as 'auto' | Locale)}
          style={{
            ...inputStyle,
            minHeight: 'auto',
            padding: '10px 12px',
            cursor: 'pointer',
          }}
        >
          {LOCALE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#64748b' }}>
          {LOCALE_OPTIONS.find(o => o.value === prefs.outputLocale)?.hint}
        </p>
      </Field>

      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: '12px', marginTop: '32px', flexWrap: 'wrap' }}>
        <button onClick={handleSave} style={btnPrimary}>
          💾 保存偏好
        </button>
        {!usingDefault && (
          <button
            onClick={handleReset}
            style={{
              ...btnSecondary,
              color: '#dc2626',
              background: '#fee2e2',
            }}
          >
            🗑 重置为默认
          </button>
        )}
      </div>

      {/* 保存成功提示 */}
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
          ✅ 偏好已保存，下次生成知识卡时生效
        </div>
      )}

      {/* 更新时间 */}
      {prefs.updatedAt && (
        <div style={{ marginTop: '16px', fontSize: '11px', color: '#94a3b8' }}>
          最后更新：{new Date(prefs.updatedAt).toLocaleString('zh-CN')}
        </div>
      )}
    </div>
  )
}

/**
 * 字段容器 — 标签 + 输入 + 提示
 */
function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <label
        style={{
          display: 'block',
          fontSize: '13px',
          fontWeight: 600,
          color: '#0f1729',
          marginBottom: '6px',
        }}
      >
        {label}
      </label>
      {children}
      {hint && (
        <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#64748b' }}>
          {hint}
        </p>
      )}
    </div>
  )
}

'use client'

/**
 * GeneralTab — 通用设置(D5 实现 + D37 i18n 重构)
 *
 * D37 新结构:4 层语言 Settings(按 v2.3-i18n-plan.md)
 * - Application Language  → UI / Help / Tooltip(下拉:Auto / 中文 / English / 日本語)
 * - Output Language       → KC 最终输出(下拉:Auto / 中文 / English / 8 种语言)
 * - Prompt Language       → 锁死 English(只读,显示推荐标记)
 * - Auto Translate        → Explain/Chat 翻译开关(checkbox)
 *
 * 保留:D5 的 Preset 选择 + 状态条 + 架构说明
 */

import { useState, useEffect } from 'react'
import { PRESET_LIST, DEFAULT_PRESET, type PresetId, getPresetTemplate } from '@/config/presets'
import type { Locale } from '@/lib/locale'
import {
  getUserPreferencesClient,
  saveUserPreferencesClient,
  clearUserPreferencesClient,
  DEFAULT_USER_PREFERENCES,
  type UserPreferences,
} from '@/lib/user-preferences'
import { useI18n } from '@/components/I18nProvider'
import { useDetectBrowserLocale } from '@/components/I18nProvider'
import { APP_LOCALE_DISPLAY, type AppLocale } from '@/lib/locale-types'
import { btnPrimary, btnSecondary, inputStyle } from '@/lib/ui-styles'

// Output Language 选项(8 种 + Auto)— 保留 D5 的原选项
const LOCALE_OPTIONS: Array<{ value: 'auto' | Locale; label: string; hintKey: string }> = [
  { value: 'auto', label: 'Auto', hintKey: 'settings.general.outputLanguageAutoHint' },
  { value: 'zh-CN', label: '中文 (简体)', hintKey: 'settings.general.outputLanguageZhHint' },
  { value: 'en-US', label: 'English (US)', hintKey: 'settings.general.outputLanguageEnHint' },
  { value: 'ja-JP', label: '日本語', hintKey: 'settings.general.outputLanguageJaHint' },
  { value: 'ko-KR', label: '한국어', hintKey: 'settings.general.outputLanguageKoHint' },
  { value: 'fr-FR', label: 'Français', hintKey: 'settings.general.outputLanguageFrHint' },
  { value: 'de-DE', label: 'Deutsch', hintKey: 'settings.general.outputLanguageDeHint' },
  { value: 'es-ES', label: 'Español', hintKey: 'settings.general.outputLanguageEsHint' },
]

// Application Language 选项
const APP_LOCALE_OPTIONS: AppLocale[] = ['auto', 'zh-CN', 'en-US', 'ja-JP']

export function GeneralTab() {
  const { t, appLocale, setLocale, resolvedLocale } = useI18n()
  const browserLocale = useDetectBrowserLocale()
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_USER_PREFERENCES)
  const [loaded, setLoaded] = useState(false)
  const [usingDefault, setUsingDefault] = useState(true)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const saved = getUserPreferencesClient()
    setPrefs(saved)
    setUsingDefault(
      saved.preset === DEFAULT_PRESET &&
      saved.outputLocale === 'auto' &&
      saved.appLocale === 'auto' &&
      saved.autoTranslate === true
    )
    setLoaded(true)
  }, [])

  const handlePresetChange = (preset: PresetId) => {
    setPrefs(prev => ({ ...prev, preset }))
    setSaved(false)
  }

  const handleOutputLocaleChange = (locale: 'auto' | Locale) => {
    setPrefs(prev => ({ ...prev, outputLocale: locale }))
    setSaved(false)
  }

  const handleAppLocaleChange = (locale: AppLocale) => {
    setPrefs(prev => ({ ...prev, appLocale: locale }))
    setLocale(locale) // 立即切换 UI 语言
    setSaved(false)
  }

  const handleAutoTranslateChange = (enabled: boolean) => {
    setPrefs(prev => ({ ...prev, autoTranslate: enabled }))
    setSaved(false)
  }

  const handleSave = () => {
    saveUserPreferencesClient(prefs)
    setUsingDefault(
      prefs.preset === DEFAULT_PRESET &&
      prefs.outputLocale === 'auto' &&
      prefs.appLocale === 'auto' &&
      prefs.autoTranslate === true
    )
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleReset = () => {
    if (!confirm(t('settings.general.resetConfirm'))) return
    clearUserPreferencesClient()
    setPrefs(DEFAULT_USER_PREFERENCES)
    setLocale('auto') // 重置 Application Language 到 auto
    setUsingDefault(true)
    setSaved(false)
  }

  if (!loaded) {
    return <div style={{ padding: '24px', color: '#64748b' }}>{t('common.loading')}</div>
  }

  const selectedPreset = getPresetTemplate(prefs.preset)
  // Preset label + description 走 i18n(根据当前 appLocale)
  const presetLabel = t(`preset.${prefs.preset}.label`)
  const presetDescription = t(`preset.${prefs.preset}.description`)

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
            ⚙️ <strong>{t('settings.general.usingDefaultStatus')}</strong>
            {t('settings.general.usingDefault')}
          </>
        ) : (
          <>
            ✅ <strong>{t('settings.general.usingCustomStatus')}</strong>
            {t('settings.general.usingCustom', { preset: presetLabel, outputLocale: prefs.outputLocale })}
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
          🎭 {t('settings.general.promptArchitecture')}
        </div>
        <div>
          <strong>System</strong> ({t('settings.general.readonly')}) → <strong>Preset Persona</strong> ({t('settings.general.presetPersona')}) → <strong>Project</strong> ({t('settings.general.promptTab')}) → <strong>User</strong> ({t('settings.general.oneshot')})
        </div>
        <div style={{ marginTop: '4px', color: '#64748b' }}>
          {t('settings.general.presetHint')}
        </div>
      </div>

      {/* === 语言区块(D37 新增)— 4 层语言 Settings === */}
      <div
        style={{
          padding: '16px 20px',
          background: '#f8fafc',
          borderRadius: '12px',
          marginBottom: '28px',
          border: '1px solid #e2e8f0',
          borderLeft: '2px solid #3b82f6',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: '14px', color: '#0f1729', marginBottom: '4px' }}>
          🌍 {t('settings.general.languageTitle')}
        </div>
        <div style={{ fontSize: '12px', color: '#475569', marginBottom: '16px', lineHeight: 1.5 }}>
          {t('settings.general.languageHint')}
        </div>

        {/* Application Language */}
        <Field
          label={t('settings.general.appLanguage')}
          hint={t('settings.general.appLanguageHint') + (appLocale === 'auto' && browserLocale ? ` (Detected: ${browserLocale})` : '')}
        >
          <select
            value={appLocale}
            onChange={e => handleAppLocaleChange(e.target.value as AppLocale)}
            style={{ ...inputStyle, minHeight: 'auto', padding: '10px 12px', cursor: 'pointer' }}
          >
            {APP_LOCALE_OPTIONS.map(locale => (
              <option key={locale} value={locale}>
                {APP_LOCALE_DISPLAY[locale].flag} {APP_LOCALE_DISPLAY[locale].label}
                {locale === 'auto' && browserLocale ? ` (→ ${browserLocale})` : ''}
              </option>
            ))}
          </select>
        </Field>

        {/* Output Language */}
        <Field
          label={t('settings.general.outputLanguage')}
          hint={t('settings.general.outputLanguageHint')}
        >
          <select
            value={prefs.outputLocale}
            onChange={e => handleOutputLocaleChange(e.target.value as 'auto' | Locale)}
            style={{ ...inputStyle, minHeight: 'auto', padding: '10px 12px', cursor: 'pointer' }}
          >
            {LOCALE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#64748b' }}>
            {t(opt_hint_key(prefs.outputLocale, LOCALE_OPTIONS))}
          </p>
        </Field>

        {/* Prompt Language(只读) */}
        <Field
          label={t('settings.general.promptLanguage')}
          hint={t('settings.general.promptLanguageHint')}
        >
          <div
            style={{
              padding: '10px 12px',
              background: '#f1f5f9',
              borderRadius: '8px',
              fontSize: '13px',
              color: '#0f1729',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span style={{ fontSize: '16px' }}>🔒</span>
            <span>{t('settings.general.promptLanguageLocked')}</span>
          </div>
        </Field>

        {/* Auto Translate */}
        <Field
          label={t('settings.general.autoTranslate')}
          hint={t('settings.general.autoTranslateHint')}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
            <input
              type="checkbox"
              checked={prefs.autoTranslate}
              onChange={e => handleAutoTranslateChange(e.target.checked)}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <span>{prefs.autoTranslate ? t('common.yes') : t('common.no')}</span>
          </label>
        </Field>
      </div>

      {/* === Preset 选择(D5 保留)== */}
      <Field label={t('settings.general.presetTitle')} hint={t('settings.general.presetHint')}>
        <select
          value={prefs.preset}
          onChange={e => handlePresetChange(e.target.value as PresetId)}
          style={{ ...inputStyle, minHeight: 'auto', padding: '10px 12px', cursor: 'pointer' }}
        >
          {PRESET_LIST.map(preset => (
            <option key={preset.id} value={preset.id}>
              {preset.icon} {t(`preset.${preset.id}.label`)} — {t(`preset.${preset.id}.description`)}
            </option>
          ))}
        </select>
      </Field>

      {/* 选中 preset 详情(走 i18n) */}
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
          {selectedPreset.icon} {t('settings.general.personaPreview', { label: presetLabel })}
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

      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: '12px', marginTop: '32px', flexWrap: 'wrap' }}>
        <button onClick={handleSave} style={btnPrimary}>
          💾 {t('settings.general.save')}
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
            🗑 {t('settings.general.resetToDefault')}
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
          ✅ {t('settings.general.savedDetail')}
        </div>
      )}

      {/* 更新时间 */}
      {prefs.updatedAt && (
        <div style={{ marginTop: '16px', fontSize: '11px', color: '#94a3b8' }}>
          {t('settings.general.lastUpdated')}: {new Date(prefs.updatedAt).toLocaleString(resolvedLocale)}
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
    <div style={{ marginBottom: '16px' }}>
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

// 辅助:根据 outputLocale 值返回对应的 hint key
function opt_hint_key(value: 'auto' | Locale, options: Array<{ value: 'auto' | Locale; hintKey: string }>): string {
  const opt = options.find(o => o.value === value)
  return opt?.hintKey || 'settings.general.outputLanguageAutoHint'
}

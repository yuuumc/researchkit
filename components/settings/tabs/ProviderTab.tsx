'use client'

import { useState, useEffect, useMemo } from 'react'
import type { ProviderConfig, ProviderType } from '@/core/llm/provider'
import { PROVIDER_PRESETS } from '@/core/llm/provider'
import {
  getUserConfigClient,
  saveUserConfigClient,
  clearUserConfigClient,
} from '@/lib/user-config'
import { useI18n } from '@/components/I18nProvider'
import { btnPrimary, btnSecondary, inputStyle } from '@/lib/ui-styles'

/**
 * ProviderTab — LLM Provider 配置(D37 i18n 化)
 *
 * 主要文案走 i18n,保留少量英文术语(Base URL / API Key 等业界通用词)
 */
export function ProviderTab() {
  const { t } = useI18n()
  const [config, setConfig] = useState<ProviderConfig>({
    type: 'deepseek',
    baseURL: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-v4-flash',
    defaultTemperature: 0.3,
  })
  const [loaded, setLoaded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [saved, setSaved] = useState(false)
  const [usingEnv, setUsingEnv] = useState(true)

  useEffect(() => {
    const saved = getUserConfigClient()
    if (saved) {
      setConfig(saved)
      setUsingEnv(false)
    }
    setLoaded(true)
  }, [])

  const handlePresetChange = (presetName: string) => {
    const preset = PROVIDER_PRESETS.find(p => p.name === presetName)
    if (!preset) return
    setConfig(prev => ({
      ...prev,
      type: preset.type,
      baseURL: preset.baseURL || prev.baseURL,
      model: preset.defaultModel || prev.model,
    }))
    setTestResult(null)
    setSaved(false)
  }

  const handleFieldChange = <K extends keyof ProviderConfig>(key: K, value: ProviderConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }))
    setTestResult(null)
    setSaved(false)
  }

  const handleTest = async () => {
    if (!config.apiKey.trim()) {
      setTestResult({ success: false, message: t('settings.provider.errorApiKeyRequired') })
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const resp = await fetch('/api/settings/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const data = await resp.json()
      setTestResult({
        success: data.success === true,
        message: data.success ? data.message : (data.error || t('settings.provider.testFail')),
      })
    } catch (err) {
      setTestResult({
        success: false,
        message: `${t('settings.provider.requestFailed')}: ${err instanceof Error ? err.message : 'unknown'}`,
      })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = () => {
    if (!config.apiKey.trim() || !config.baseURL.trim() || !config.model.trim()) {
      setTestResult({ success: false, message: t('settings.provider.errorFieldsRequired') })
      return
    }
    saveUserConfigClient(config)
    setUsingEnv(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleReset = () => {
    if (!confirm(t('settings.provider.resetConfirm'))) return
    clearUserConfigClient()
    setConfig({
      type: 'deepseek',
      baseURL: 'https://api.deepseek.com/v1',
      apiKey: '',
      model: 'deepseek-v4-flash',
      defaultTemperature: 0.3,
    })
    setUsingEnv(true)
    setTestResult(null)
    setSaved(false)
  }

  // C1 修复：API Key 永不明文显示，仅支持复制到剪贴板
  const handleCopyApiKey = async () => {
    if (!config.apiKey) return
    try {
      await navigator.clipboard.writeText(config.apiKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = config.apiKey
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      try {
        document.execCommand('copy')
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {}
      document.body.removeChild(textarea)
    }
  }

  const currentPreset = useMemo(() => {
    return PROVIDER_PRESETS.find(p => p.type === config.type) || PROVIDER_PRESETS[0]
  }, [config.type])

  if (!loaded) {
    return <div style={{ padding: '24px', color: '#64748b' }}>{t('common.loading')}</div>
  }

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
          background: usingEnv ? '#fef3c7' : '#dcfce7',
          border: `1px solid ${usingEnv ? '#fbbf24' : '#22c55e'}`,
          fontSize: '13px',
          color: '#1e293b',
        }}
      >
        {usingEnv ? (
          <>
            ⚠️ <strong>{t('settings.provider.usingEnv')}</strong>
            {t('settings.provider.usingEnvHint')}
          </>
        ) : (
          <>
            ✅ <strong>{t('settings.provider.usingCustom')}</strong>
            {t('settings.provider.usingCustomHint')}
          </>
        )}
      </div>

      <Field label={t('settings.provider.presetLabel')} hint={t('settings.provider.presetHint')}>
        <select
          value={currentPreset.name}
          onChange={e => handlePresetChange(e.target.value)}
          style={{ ...inputStyle, minHeight: 'auto', padding: '10px 12px', cursor: 'pointer' }}
        >
          {PROVIDER_PRESETS.map(preset => (
            <option key={preset.type} value={preset.name}>
              {preset.name} — {preset.description}
            </option>
          ))}
        </select>
        {currentPreset.docsUrl && (
          <a
            href={currentPreset.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '12px', color: '#6366f1', textDecoration: 'none', marginTop: '6px', display: 'inline-block' }}
          >
            → {t('settings.provider.getApiKey')}
          </a>
        )}
      </Field>

      <Field label={t('settings.provider.baseUrl')} hint={t('settings.provider.baseUrlHint')}>
        <input
          type="text"
          value={config.baseURL}
          onChange={e => handleFieldChange('baseURL', e.target.value)}
          placeholder="https://api.deepseek.com/v1"
          style={{ ...inputStyle, minHeight: 'auto', padding: '10px 12px' }}
        />
      </Field>

      <Field label={t('settings.provider.apiKey')} hint={t('settings.provider.apiKeyHint')}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="password"
            value={config.apiKey}
            onChange={e => handleFieldChange('apiKey', e.target.value)}
            placeholder="sk-..."
            style={{ ...inputStyle, minHeight: 'auto', padding: '10px 12px', flex: 1, fontFamily: 'monospace' }}
          />
          <button
            onClick={handleCopyApiKey}
            disabled={!config.apiKey}
            style={{
              ...btnSecondary,
              padding: '10px 14px',
              flexShrink: 0,
              opacity: !config.apiKey ? 0.5 : 1,
              cursor: !config.apiKey ? 'not-allowed' : 'pointer',
            }}
          >
            {copied ? t('settings.provider.copied') : t('settings.provider.copy')}
          </button>
        </div>
      </Field>

      <Field label={t('settings.provider.model')} hint={t('settings.provider.modelHint')}>
        <input
          type="text"
          value={config.model}
          onChange={e => handleFieldChange('model', e.target.value)}
          placeholder="deepseek-v4-flash"
          list="model-suggestions"
          style={{ ...inputStyle, minHeight: 'auto', padding: '10px 12px', fontFamily: 'monospace' }}
        />
        <datalist id="model-suggestions">
          {currentPreset && <option value={currentPreset.defaultModel} />}
          {['gpt-4o', 'gpt-4o-mini', 'deepseek-v4-flash', 'deepseek-v4-pro', 'llama-3.1-70b-versatile', 'llama-3.1-8b-instant'].map(m => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </Field>

      <Field label={t('settings.provider.temperature')} hint={t('settings.provider.temperatureHint', { value: (config.defaultTemperature ?? 0.3).toFixed(1) })}>
        <input
          type="range"
          min={0}
          max={1.5}
          step={0.1}
          value={config.defaultTemperature ?? 0.3}
          onChange={e => handleFieldChange('defaultTemperature', parseFloat(e.target.value))}
          style={{ width: '100%' }}
        />
      </Field>

      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: '12px', marginTop: '32px', flexWrap: 'wrap' }}>
        <button
          onClick={handleTest}
          disabled={testing}
          style={{ ...btnSecondary, opacity: testing ? 0.6 : 1, cursor: testing ? 'wait' : 'pointer' }}
        >
          {testing ? t('settings.provider.testing') : t('settings.provider.testConnection')}
        </button>
        <button onClick={handleSave} style={btnPrimary}>
          {t('settings.provider.save')}
        </button>
        {!usingEnv && (
          <button
            onClick={handleReset}
            style={{ ...btnSecondary, color: '#dc2626', background: '#fee2e2' }}
          >
            {t('settings.provider.resetToEnv')}
          </button>
        )}
      </div>

      {testResult && (
        <div
          style={{
            marginTop: '20px',
            padding: '12px 16px',
            borderRadius: '10px',
            background: testResult.success ? '#dcfce7' : '#fee2e2',
            border: `1px solid ${testResult.success ? '#22c55e' : '#ef4444'}`,
            fontSize: '13px',
            color: '#1e293b',
          }}
        >
          {testResult.success ? '✅ ' : '❌ '}
          {testResult.message}
        </div>
      )}

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
          ✅ {t('settings.provider.savedDetail')}
        </div>
      )}
    </div>
  )
}

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
        <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#64748b' }}>{hint}</p>
      )}
    </div>
  )
}

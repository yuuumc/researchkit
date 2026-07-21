'use client'

import { useState, useEffect, useMemo } from 'react'
import type { ProviderConfig, ProviderType } from '@/core/llm/provider'
import { PROVIDER_PRESETS } from '@/core/llm/provider'
import {
  getUserConfigClient,
  saveUserConfigClient,
  clearUserConfigClient,
} from '@/lib/user-config'
import { btnPrimary, btnSecondary, inputStyle } from '@/lib/ui-styles'

/**
 * ProviderTab — LLM Provider 配置
 *
 * 功能：
 * - 5 个预设 Provider 下拉选择
 * - 选预设后自动填 baseURL + 默认 model
 * - API Key 输入框（password 模式，可切换显示）
 * - "测试连接"按钮（调 /api/settings/test-provider）
 * - "保存"按钮（写 localStorage + cookie）
 * - "重置"按钮（清除用户配置，回到 .env.local）
 */
export function ProviderTab() {
  const [config, setConfig] = useState<ProviderConfig>({
    type: 'deepseek',
    baseURL: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-v4-flash',
    defaultTemperature: 0.3,
  })
  const [loaded, setLoaded] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [saved, setSaved] = useState(false)
  const [usingEnv, setUsingEnv] = useState(true)

  // 加载已保存的配置
  useEffect(() => {
    const saved = getUserConfigClient()
    if (saved) {
      setConfig(saved)
      setUsingEnv(false)
    }
    setLoaded(true)
  }, [])

  // 选择预设时自动填 baseURL + model
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
      setTestResult({ success: false, message: '请先填写 API Key' })
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
        message: data.success ? data.message : (data.error || '测试失败'),
      })
    } catch (err) {
      setTestResult({
        success: false,
        message: `请求失败：${err instanceof Error ? err.message : 'unknown'}`,
      })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = () => {
    if (!config.apiKey.trim() || !config.baseURL.trim() || !config.model.trim()) {
      setTestResult({ success: false, message: '请填写完整：Base URL / API Key / Model' })
      return
    }
    saveUserConfigClient(config)
    setUsingEnv(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleReset = () => {
    if (!confirm('确定要清除已保存的 Provider 配置吗？将回退到 .env.local 中的环境变量配置。')) {
      return
    }
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

  const currentPreset = useMemo(() => {
    return PROVIDER_PRESETS.find(p => p.type === config.type) || PROVIDER_PRESETS[0]
  }, [config.type])

  if (!loaded) {
    return <div style={{ padding: '24px', color: '#64748b' }}>Loading...</div>
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
      {/* 状态条：当前生效配置 */}
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
            ⚠️ <strong>当前使用 .env.local 环境变量配置</strong>
            （Settings 页保存后会覆盖此配置）
          </>
        ) : (
          <>
            ✅ <strong>当前使用 Settings 页保存的配置</strong>
            （覆盖 .env.local）
          </>
        )}
      </div>

      {/* 预设选择 */}
      <Field label="Provider Preset" hint="选择预设后自动填 Base URL + 默认 Model">
        <select
          value={currentPreset.name}
          onChange={e => handlePresetChange(e.target.value)}
          style={{
            ...inputStyle,
            minHeight: 'auto',
            padding: '10px 12px',
            cursor: 'pointer',
          }}
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
            → 获取 API Key
          </a>
        )}
      </Field>

      {/* Base URL */}
      <Field label="Base URL" hint="OpenAI Compatible API 的 endpoint">
        <input
          type="text"
          value={config.baseURL}
          onChange={e => handleFieldChange('baseURL', e.target.value)}
          placeholder="https://api.deepseek.com/v1"
          style={{ ...inputStyle, minHeight: 'auto', padding: '10px 12px' }}
        />
      </Field>

      {/* API Key */}
      <Field label="API Key" hint="保存在浏览器 localStorage 和 cookie 中，不会上传服务器">
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type={showApiKey ? 'text' : 'password'}
            value={config.apiKey}
            onChange={e => handleFieldChange('apiKey', e.target.value)}
            placeholder="sk-..."
            style={{ ...inputStyle, minHeight: 'auto', padding: '10px 12px', flex: 1, fontFamily: 'monospace' }}
          />
          <button
            onClick={() => setShowApiKey(!showApiKey)}
            style={{
              ...btnSecondary,
              padding: '10px 14px',
              flexShrink: 0,
            }}
          >
            {showApiKey ? '🙈 隐藏' : '👁 显示'}
          </button>
        </div>
      </Field>

      {/* Model */}
      <Field label="Model" hint="模型名（需与 Provider 支持的模型一致）">
        <input
          type="text"
          value={config.model}
          onChange={e => handleFieldChange('model', e.target.value)}
          placeholder="deepseek-v4-flash"
          list="model-suggestions"
          style={{ ...inputStyle, minHeight: 'auto', padding: '10px 12px', fontFamily: 'monospace' }}
        />
        <datalist id="model-suggestions">
          {currentPreset && (
            <>
              <option value={currentPreset.defaultModel} />
            </>
          )}
          {['gpt-4o', 'gpt-4o-mini', 'deepseek-v4-flash', 'deepseek-v4-pro', 'llama-3.1-70b-versatile', 'llama-3.1-8b-instant'].map(m => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </Field>

      {/* Temperature */}
      <Field label="Default Temperature" hint={`低温度（0-0.5）输出稳定，高温度（0.7-1.5）更有创意。当前：${config.defaultTemperature ?? 0.3}`}>
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
          style={{
            ...btnSecondary,
            opacity: testing ? 0.6 : 1,
            cursor: testing ? 'wait' : 'pointer',
          }}
        >
          {testing ? '⏳ 测试中...' : '🔌 测试连接'}
        </button>
        <button onClick={handleSave} style={btnPrimary}>
          💾 保存配置
        </button>
        {!usingEnv && (
          <button
            onClick={handleReset}
            style={{
              ...btnSecondary,
              color: '#dc2626',
              background: '#fee2e2',
            }}
          >
            🗑 重置为环境变量
          </button>
        )}
      </div>

      {/* 测试结果 */}
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
          ✅ 配置已保存，下次生成知识卡时生效
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

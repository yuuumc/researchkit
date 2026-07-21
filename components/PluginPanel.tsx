'use client'

/**
 * PluginPanel — D12 Plugin System UI
 *
 * UI 设计（基于用户偏好：卡片 + 可折叠 + 互动动画）：
 * - 卡片头部：🧩 Plugin Marketplace 标题 + 已安装数量 badge
 * - 主体：插件卡片网格
 *   每张卡片：
 *   - 图标 + 名称 + 版本 + tags
 *   - 描述
 *   - 启用/禁用 toggle
 *   - [导出] 按钮（执行 plugin.export()）
 *   - 配置区（requiresConfig=true 时显示表单）
 *   - 最后执行结果（成功/失败 + 时间戳 + URL）
 *
 * 交互细节：
 * - 切换 enabled → 立即写 localStorage
 * - 点 [导出] → 调用 plugin.export() → 显示进度 + 结果
 * - 成功 download 类型 → 自动触发浏览器下载
 * - 成功 publish 类型 → 显示可点击的 URL
 * - 失败 → 红色提示 + retry
 *
 * 数据流：
 * 1. 组件 mount → 从 pluginRegistry.list() 拉所有插件
 * 2. 每个插件状态从 localStorage loadPluginStates() 读
 * 3. 用户操作 → 更新 localStorage + 组件 state
 */

import { useState, useEffect, useCallback } from 'react'
import type { KnowledgeCard } from '@/types/knowledge'
import type { ExportPlugin, ExportResult, PluginState, PluginConfig } from '@/types/plugin'
import { jsonDownloadPlugin, markdownDownloadPlugin } from '@/core/plugins/sample-plugins'
import {
  loadPluginStates,
  setPluginEnabled,
  updatePluginConfig,
  recordPluginExecution,
} from '@/lib/plugin-states'
import { btnPrimary, btnSecondary } from '@/lib/ui-styles'

// ============================================================================
// 类型
// ============================================================================

export interface PluginPanelProps {
  /** 当前知识卡（无 KC 时禁用导出按钮） */
  knowledgeCard: KnowledgeCard | null
}

// ============================================================================
// 内置插件列表（客户端入口）
//
// 注意：registry.ts 是单例，但 Next.js 的 SSR + 客户端可能各持一份。
// 在客户端直接 import 插件实例最稳，避免 SSR/CSR mismatch。
// ============================================================================

const BUILTIN_PLUGINS: ExportPlugin[] = [jsonDownloadPlugin, markdownDownloadPlugin]

// ============================================================================
// 主组件
// ============================================================================

export function PluginPanel({ knowledgeCard }: PluginPanelProps) {
  const [states, setStates] = useState<Record<string, PluginState>>({})
  const [executing, setExecuting] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, ExportResult>>({})

  // 初次加载从 localStorage 恢复
  useEffect(() => {
    setStates(loadPluginStates())
  }, [])

  const handleToggleEnabled = useCallback((pluginId: string, enabled: boolean) => {
    setPluginEnabled(pluginId, enabled)
    setStates((prev) => ({
      ...prev,
      [pluginId]: {
        ...(prev[pluginId] || { pluginId, enabled: true, config: {} }),
        enabled,
      },
    }))
  }, [])

  const handleConfigChange = useCallback((pluginId: string, key: string, value: string | boolean) => {
    const current = states[pluginId] || { pluginId, enabled: true, config: {} }
    const newConfig: PluginConfig = { ...current.config, [key]: value }
    updatePluginConfig(pluginId, newConfig)
    setStates((prev) => ({
      ...prev,
      [pluginId]: { ...current, config: newConfig },
    }))
  }, [states])

  const handleExport = useCallback(async (plugin: ExportPlugin) => {
    if (!knowledgeCard) return
    if (executing) return

    setExecuting(plugin.meta.id)

    try {
      // 预校验
      if (plugin.validate) {
        const err = plugin.validate(knowledgeCard)
        if (err) {
          const result: ExportResult = {
            success: false,
            message: `预校验失败：${err}`,
            error: err,
          }
          setResults((r) => ({ ...r, [plugin.meta.id]: result }))
          recordPluginExecution(plugin.meta.id, {
            success: false,
            message: result.message,
          })
          return
        }
      }

      const state = states[plugin.meta.id] || { pluginId: plugin.meta.id, enabled: true, config: {} }

      const result = await plugin.export({
        knowledgeCard,
        config: state.config,
        action: 'export',
      })

      setResults((r) => ({ ...r, [plugin.meta.id]: result }))

      // 持久化执行结果
      recordPluginExecution(plugin.meta.id, {
        success: result.success,
        message: result.message,
        url: result.url,
      })

      // download 类型 — 自动触发浏览器下载
      if (result.success && result.data != null && result.filename) {
        triggerDownload(
          typeof result.data === 'string' ? result.data : result.data,
          result.filename,
          result.mimeType || 'application/octet-stream'
        )
      }
    } catch (err) {
      const result: ExportResult = {
        success: false,
        message: '执行异常',
        error: err instanceof Error ? err.message : String(err),
      }
      setResults((r) => ({ ...r, [plugin.meta.id]: result }))
      recordPluginExecution(plugin.meta.id, { success: false, message: result.message })
    } finally {
      setExecuting(null)
    }
  }, [knowledgeCard, executing, states])

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
          background: 'linear-gradient(135deg, #ede9fe 0%, #fce7f3 100%)',
          borderBottom: '1px solid #e9d5ff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>🧩</span>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#581c87' }}>
              Plugin Marketplace
            </div>
            <div style={{ fontSize: '11px', color: '#7c3aed', marginTop: '2px' }}>
              一键导出 Knowledge Card 到第三方工具
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', fontSize: '11px', color: '#7c3aed' }}>
          <span style={{ background: 'rgba(255,255,255,0.6)', padding: '2px 8px', borderRadius: '999px', fontWeight: 600 }}>
            📦 {BUILTIN_PLUGINS.length} 个已安装
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '16px' }}>
        {!knowledgeCard && (
          <div
            style={{
              padding: '20px',
              textAlign: 'center',
              color: '#94a3b8',
              fontSize: '12px',
            }}
          >
            ⚠️ 请先生成 Knowledge Card 后再使用 Plugin 导出
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {BUILTIN_PLUGINS.map((plugin) => (
            <PluginCard
              key={plugin.meta.id}
              plugin={plugin}
              state={states[plugin.meta.id] || { pluginId: plugin.meta.id, enabled: true, config: {} }}
              result={results[plugin.meta.id]}
              executing={executing === plugin.meta.id}
              disabled={!knowledgeCard}
              onToggleEnabled={(enabled) => handleToggleEnabled(plugin.meta.id, enabled)}
              onConfigChange={(key, value) => handleConfigChange(plugin.meta.id, key, value)}
              onExport={() => handleExport(plugin)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// 单个插件卡片
// ============================================================================

function PluginCard({
  plugin,
  state,
  result,
  executing,
  disabled,
  onToggleEnabled,
  onConfigChange,
  onExport,
}: {
  plugin: ExportPlugin
  state: PluginState
  result?: ExportResult
  executing: boolean
  disabled: boolean
  onToggleEnabled: (enabled: boolean) => void
  onConfigChange: (key: string, value: string | boolean) => void
  onExport: () => void
}) {
  const meta = plugin.meta
  const isDisabled = !state.enabled || disabled

  return (
    <div
      style={{
        padding: '12px 14px',
        background: state.enabled ? 'white' : '#fafbfc',
        border: `2px solid ${result?.success ? '#a7f3d0' : result && !result.success ? '#fecaca' : '#e2e8f0'}`,
        borderRadius: '8px',
        opacity: disabled ? 0.6 : 1,
        transition: 'all 0.2s',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: `${meta.color}15`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            flexShrink: 0,
          }}
        >
          {meta.icon}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f1729' }}>
              {meta.name}
            </span>
            <span
              style={{
                fontSize: '9px',
                padding: '1px 5px',
                background: '#f1f5f9',
                color: '#64748b',
                borderRadius: '3px',
                fontWeight: 600,
              }}
            >
              v{meta.version}
            </span>
            {meta.tags.map((t) => (
              <span
                key={t}
                style={{
                  fontSize: '9px',
                  padding: '1px 5px',
                  background: t === 'official' ? '#dbeafe' : '#f3f4f6',
                  color: t === 'official' ? '#1e40af' : '#475569',
                  borderRadius: '3px',
                  fontWeight: 600,
                }}
              >
                {t}
              </span>
            ))}
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px', lineHeight: 1.4 }}>
            {meta.description}
          </div>
        </div>

        {/* Enable toggle */}
        <label
          style={{
            position: 'relative',
            display: 'inline-block',
            width: '34px',
            height: '18px',
            flexShrink: 0,
          }}
        >
          <input
            type="checkbox"
            checked={state.enabled}
            onChange={(e) => onToggleEnabled(e.target.checked)}
            disabled={disabled}
            style={{ opacity: 0, width: 0, height: 0 }}
          />
          <span
            style={{
              position: 'absolute',
              cursor: disabled ? 'not-allowed' : 'pointer',
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: state.enabled ? '#10b981' : '#cbd5e1',
              transition: '0.3s',
              borderRadius: '999px',
            }}
          >
            <span
              style={{
                position: 'absolute',
                content: '""',
                height: '14px',
                width: '14px',
                left: state.enabled ? '18px' : '2px',
                top: '2px',
                background: 'white',
                borderRadius: '50%',
                transition: '0.3s',
              }}
            />
          </span>
        </label>
      </div>

      {/* Capabilities */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '10px' }}>
        {plugin.capabilities.map((cap, i) => (
          <span
            key={i}
            style={{
              fontSize: '9px',
              padding: '2px 6px',
              background: '#f8fafc',
              color: '#475569',
              borderRadius: '4px',
              fontWeight: 500,
              border: '1px solid #e2e8f0',
            }}
          >
            {cap.type} · {cap.format}
          </span>
        ))}
      </div>

      {/* Config form (if requiredConfig) */}
      {meta.requiresConfig && meta.configSchema && meta.configSchema.length > 0 && state.enabled && (
        <div style={{ marginBottom: '10px', padding: '8px', background: '#f8fafc', borderRadius: '6px' }}>
          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            ⚙️ 配置
          </div>
          {meta.configSchema.map((field) => (
            <div key={field.key} style={{ marginBottom: '6px' }}>
              <label style={{ fontSize: '11px', color: '#475569', fontWeight: 600, display: 'block', marginBottom: '3px' }}>
                {field.label} {field.required && <span style={{ color: '#dc2626' }}>*</span>}
              </label>
              <input
                type={field.type === 'password' ? 'password' : field.type === 'boolean' ? 'checkbox' : 'text'}
                placeholder={field.placeholder}
                value={String(state.config[field.key] ?? field.defaultValue ?? '')}
                checked={field.type === 'boolean' ? Boolean(state.config[field.key] ?? field.defaultValue) : undefined}
                onChange={(e) =>
                  onConfigChange(
                    field.key,
                    field.type === 'boolean' ? e.target.checked : e.target.value
                  )
                }
                style={{
                  width: '100%',
                  padding: '4px 8px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontFamily: 'inherit',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {field.helpText && (
                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>{field.helpText}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Action button */}
      <button
        onClick={onExport}
        disabled={isDisabled || executing}
        style={{
          ...btnPrimary,
          width: '100%',
          padding: '8px 12px',
          background: isDisabled || executing ? '#cbd5e1' : `linear-gradient(135deg, ${meta.color} 0%, ${meta.color}dd 100%)`,
          opacity: isDisabled || executing ? 0.7 : 1,
          cursor: isDisabled || executing ? 'not-allowed' : 'pointer',
          fontSize: '12px',
          fontWeight: 700,
        }}
      >
        {executing ? '⏳ 执行中...' : `🚀 ${meta.icon} 执行导出`}
      </button>

      {/* Result */}
      {result && (
        <div
          style={{
            marginTop: '8px',
            padding: '8px 10px',
            background: result.success ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${result.success ? '#bbf7d0' : '#fecaca'}`,
            borderRadius: '6px',
            fontSize: '11px',
            color: result.success ? '#166534' : '#991b1b',
            animation: 'fadeIn 0.3s ease-out',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <span>{result.success ? '✅' : '❌'}</span>
            <span style={{ fontWeight: 600 }}>{result.success ? '成功' : '失败'}</span>
            {result.durationMs && (
              <span style={{ fontSize: '9px', color: '#94a3b8', marginLeft: 'auto' }}>
                ⚡ {result.durationMs}ms
              </span>
            )}
          </div>
          <div style={{ lineHeight: 1.4 }}>{result.message}</div>

          {result.success && result.url && (
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                marginTop: '4px',
                fontSize: '11px',
                color: '#2563eb',
                textDecoration: 'underline',
                wordBreak: 'break-all',
              }}
            >
              🔗 {result.url}
            </a>
          )}

          {result.error && !result.success && (
            <div style={{ marginTop: '4px', fontSize: '10px', color: '#7f1d1d', fontFamily: 'monospace' }}>
              {result.error}
            </div>
          )}
        </div>
      )}

      {/* Last execution record */}
      {!result && state.lastResult && state.lastExecutedAt && (
        <div
          style={{
            marginTop: '8px',
            padding: '6px 8px',
            background: '#f8fafc',
            borderRadius: '4px',
            fontSize: '10px',
            color: '#64748b',
            display: 'flex',
            gap: '6px',
            alignItems: 'center',
          }}
        >
          <span>{state.lastResult.success ? '✅' : '❌'}</span>
          <span style={{ flex: 1 }}>{state.lastResult.message}</span>
          <span style={{ fontSize: '9px', color: '#94a3b8' }}>
            {formatRelativeTime(state.lastExecutedAt)}
          </span>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      ` }} />
    </div>
  )
}

// ============================================================================
// 辅助
// ============================================================================

function triggerDownload(data: string | Uint8Array, filename: string, mimeType: string): void {
  if (typeof window === 'undefined') return
  // 兼容 Uint8Array + string — 统一转 Uint8Array 再构造 Blob（避免 SharedArrayBuffer 类型冲突）
  const bytes = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // 延迟释放 URL（避免下载未启动）
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`
  return new Date(timestamp).toLocaleDateString()
}

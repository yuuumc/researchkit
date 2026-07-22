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
import type { ExportPlugin, ExportResult, PluginState, PluginConfig, PluginPermissions } from '@/types/plugin'
import type { PluginManifest } from '@/types/plugin-manifest'
import { jsonDownloadPlugin, markdownDownloadPlugin } from '@/core/plugins/sample-plugins'
import { onchainExportPlugin, RESEARCHKIT_REGISTRY_CONTRACT } from '@/core/plugins/onchain-export'
import {
  loadPluginStates,
  setPluginEnabled,
  updatePluginConfig,
  recordPluginExecution,
} from '@/lib/plugin-states'
import { loadLedger, type OnchainRecord } from '@/lib/onchain-ledger'
import { shortAddress } from '@/lib/onchain-utils'
import { btnPrimary, btnSecondary } from '@/lib/ui-styles'
import { pluginRegistry } from '@/core/plugins/registry'
import {
  loadMarketplace,
  installPlugin,
  loadInstalledManifests,
} from '@/lib/plugin-marketplace'
import { useI18n } from '@/components/I18nProvider'

type TFn = (key: string, params?: Record<string, string | number>) => string

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

const BUILTIN_PLUGINS: ExportPlugin[] = [jsonDownloadPlugin, markdownDownloadPlugin, onchainExportPlugin]

// D31 — 把内置插件注册到 registry（让 triggerLifecycle / listByCategory 能找到）
// 仅注册一次（registry 内部去重）
if (typeof window !== 'undefined') {
  for (const p of BUILTIN_PLUGINS) {
    pluginRegistry.register(p)
  }
}

// ============================================================================
// 主组件
// ============================================================================

export function PluginPanel({ knowledgeCard }: PluginPanelProps) {
  const { t } = useI18n()
  const [states, setStates] = useState<Record<string, PluginState>>({})
  const [executing, setExecuting] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, ExportResult>>({})

  // D33 — 批量执行队列
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchProgress, setBatchProgress] = useState<{
    running: boolean
    total: number
    current: number          // 当前是第几个（1-indexed）
    currentPluginId: string | null
    successes: number
    failures: number
    done: boolean            // 本轮已完成（用于显示汇总）
  }>({ running: false, total: 0, current: 0, currentPluginId: null, successes: 0, failures: 0, done: false })

  // 初次加载从 localStorage 恢复
  useEffect(() => {
    setStates(loadPluginStates())
  }, [])

  // D33 — 切换批量模式时清空选择
  const handleToggleBatchMode = useCallback((on: boolean) => {
    setBatchMode(on)
    setSelectedIds(new Set())
    setBatchProgress({ running: false, total: 0, current: 0, currentPluginId: null, successes: 0, failures: 0, done: false })
  }, [])

  const handleToggleSelect = useCallback((pluginId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(pluginId)) next.delete(pluginId)
      else next.add(pluginId)
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(BUILTIN_PLUGINS.filter(p => p.meta.id !== 'onchain-export').map(p => p.meta.id)))
  }, [])

  const handleUnselectAll = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const handleToggleEnabled = useCallback(async (pluginId: string, enabled: boolean) => {
    // D31 — 触发 lifecycle 钩子（onEnable/onDisable）
    // 失败时回滚 toggle 并显示错误
    if (enabled) {
      const result = await pluginRegistry.triggerLifecycle(pluginId, 'onEnable', {
        config: loadPluginStates()[pluginId]?.config || {},
      })
      if (!result.success) {
        const msg = result.error || result.message || 'onEnable 钩子失败'
        setResults((r) => ({
          ...r,
          [pluginId]: { success: false, message: `生命周期钩子失败：${msg}`, error: msg },
        }))
        return  // 不更新 state，保持 disabled
      }
    } else {
      // onDisable 钩子失败不阻塞（即使清理失败也允许禁用）
      await pluginRegistry.triggerLifecycle(pluginId, 'onDisable', {
        config: loadPluginStates()[pluginId]?.config || {},
      })
    }
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

  // D33 — 抽取共用执行逻辑（单次 + 批量复用）
  // 返回 ExportResult，由调用方控制 setExecuting
  const executePlugin = useCallback(async (plugin: ExportPlugin): Promise<ExportResult> => {
    if (!knowledgeCard) {
      return { success: false, message: '无 Knowledge Card', error: 'NO_KC' }
    }

    try {
      // 预校验
      if (plugin.validate) {
        const err = plugin.validate(knowledgeCard)
        if (err) {
          const result: ExportResult = {
            success: false,
            message: t('agent.pluginPanel.precheckFailed', { error: err }),
            error: err,
          }
          setResults((r) => ({ ...r, [plugin.meta.id]: result }))
          recordPluginExecution(plugin.meta.id, {
            success: false,
            message: result.message,
          })
          return result
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

      return result
    } catch (err) {
      const result: ExportResult = {
        success: false,
        message: t('agent.pluginPanel.execError'),
        error: err instanceof Error ? err.message : String(err),
      }
      setResults((r) => ({ ...r, [plugin.meta.id]: result }))
      recordPluginExecution(plugin.meta.id, { success: false, message: result.message })
      return result
    }
  }, [knowledgeCard, states])

  const handleExport = useCallback(async (plugin: ExportPlugin) => {
    if (!knowledgeCard) return
    if (executing || batchProgress.running) return

    // P1-2 onchain 导出二次确认
    // 防止误触 broadcast（即便当前是 mock 模式，未来切 real 时这层确认已是必须的）
    if (plugin.meta.id === 'onchain-export') {
      const ok = window.confirm(
        t('agent.pluginPanel.onchainConfirm', { defaultValue: '即将把知识卡发布到链上 registry，确认继续？' })
      )
      if (!ok) return
    }

    setExecuting(plugin.meta.id)
    try {
      await executePlugin(plugin)
    } finally {
      setExecuting(null)
    }
  }, [knowledgeCard, executing, batchProgress.running, executePlugin, t])

  // D33 — 批量串行执行选中插件
  const handleBatchExport = useCallback(async () => {
    if (!knowledgeCard) return
    if (batchProgress.running) return
    if (selectedIds.size === 0) return

    const queue = BUILTIN_PLUGINS.filter((p) => selectedIds.has(p.meta.id))
    setBatchProgress({
      running: true,
      total: queue.length,
      current: 0,
      currentPluginId: null,
      successes: 0,
      failures: 0,
      done: false,
    })

    let successes = 0
    let failures = 0

    for (let i = 0; i < queue.length; i++) {
      const plugin = queue[i]
      setBatchProgress((prev) => ({
        ...prev,
        current: i + 1,
        currentPluginId: plugin.meta.id,
      }))

      const result = await executePlugin(plugin)
      if (result.success) successes++
      else failures++

      setBatchProgress((prev) => ({
        ...prev,
        successes,
        failures,
      }))
    }

    setBatchProgress((prev) => ({
      ...prev,
      running: false,
      currentPluginId: null,
      done: true,
    }))
  }, [knowledgeCard, selectedIds, batchProgress.running, executePlugin])

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
              {t('agent.pluginPanel.marketplace')}
            </div>
            <div style={{ fontSize: '11px', color: '#7c3aed', marginTop: '2px' }}>
              {t('agent.pluginPanel.hint')}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', fontSize: '11px', color: '#7c3aed', alignItems: 'center' }}>
          <span style={{ background: 'rgba(255,255,255,0.6)', padding: '2px 8px', borderRadius: '999px', fontWeight: 600 }}>
            {t('agent.pluginPanel.installed', { count: BUILTIN_PLUGINS.length })}
          </span>
          {/* D33 — 批量模式 toggle */}
          {knowledgeCard && (
            <button
              onClick={() => handleToggleBatchMode(!batchMode)}
              style={{
                padding: '2px 8px',
                background: batchMode ? '#7c3aed' : 'rgba(255,255,255,0.6)',
                color: batchMode ? 'white' : '#7c3aed',
                border: `1px solid ${batchMode ? '#7c3aed' : '#d8b4fe'}`,
                borderRadius: '999px',
                fontSize: '10px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              title="勾选多个插件一次性导出"
            >
              {batchMode ? '✓ 批量模式' : '⚡ 批量模式'}
            </button>
          )}
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
            {t('agent.pluginPanel.requireKc')}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* D33 — 批量工具栏 */}
          {batchMode && knowledgeCard && (
            <BatchToolbar
              selectedCount={selectedIds.size}
              total={BUILTIN_PLUGINS.length}
              running={batchProgress.running}
              done={batchProgress.done}
              successes={batchProgress.successes}
              failures={batchProgress.failures}
              current={batchProgress.current}
              currentPluginId={batchProgress.currentPluginId}
              currentPluginName={
                batchProgress.currentPluginId
                  ? BUILTIN_PLUGINS.find(p => p.meta.id === batchProgress.currentPluginId)?.meta.name || ''
                  : ''
              }
              onSelectAll={handleSelectAll}
              onUnselectAll={handleUnselectAll}
              onRun={handleBatchExport}
            />
          )}
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
              selectionMode={batchMode}
              selected={selectedIds.has(plugin.meta.id)}
              onToggleSelect={() => handleToggleSelect(plugin.meta.id)}
              batchRunning={batchProgress.running}
              isCurrentInBatch={batchProgress.currentPluginId === plugin.meta.id}
            />
          ))}
        </div>

        {/* D13 Onchain History — 历史发布记录 */}
        {knowledgeCard && (
          <OnchainHistory knowledgeCard={knowledgeCard} refreshTrigger={executing} />
        )}

        {/* D32 — Plugin Marketplace 远程插件市场 */}
        <MarketplacePanel />

        {/* Demo Mode 声明 */}
        <div
          style={{
            marginTop: '12px',
            padding: '8px 10px',
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            borderRadius: '6px',
            fontSize: '10px',
            color: '#9a3412',
            lineHeight: 1.5,
          }}
          dangerouslySetInnerHTML={{ __html: t('agent.pluginPanel.demoMode') }}
        />
      </div>
    </div>
  )
}

// ============================================================================
// D13 Onchain History — 历史发布记录
// ============================================================================

function OnchainHistory({
  knowledgeCard,
  refreshTrigger,
}: {
  knowledgeCard: KnowledgeCard
  refreshTrigger: string | null
}) {
  const { t } = useI18n()
  const [records, setRecords] = useState<OnchainRecord[]>([])
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    // refreshTrigger 变化时重新加载（执行完成后刷新）
    const ledger = loadLedger()
    const mine = ledger.filter(r => r.title === knowledgeCard.title)
    setRecords(mine.reverse()) // 最新在前
  }, [knowledgeCard.title, refreshTrigger])

  if (records.length === 0) return null

  return (
    <div
      style={{
        marginTop: '12px',
        padding: '10px 12px',
        background: '#fffbeb',
        border: '1px solid #fde68a',
        borderRadius: '8px',
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          color: '#92400e',
          fontSize: '12px',
          fontWeight: 700,
        }}
      >
        <span>{expanded ? '▾' : '▸'}</span>
        <span>{t('agent.pluginPanel.onchainHistory')}</span>
        <span
          style={{
            marginLeft: 'auto',
            background: '#fef3c7',
            padding: '1px 6px',
            borderRadius: '999px',
            fontSize: '10px',
            fontWeight: 600,
          }}
        >
          {t('agent.pluginPanel.times', { count: records.length })}
        </span>
      </button>

      {expanded && (
        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {records.map((r) => (
            <OnchainRecordItem key={r.id + r.publishedAt} record={r} />
          ))}
        </div>
      )}
    </div>
  )
}

function OnchainRecordItem({ record }: { record: OnchainRecord }) {
  const { t } = useI18n()
  const [showDetails, setShowDetails] = useState(false)

  return (
    <div
      style={{
        padding: '8px 10px',
        background: 'white',
        border: '1px solid #fde68a',
        borderRadius: '6px',
        fontSize: '11px',
        animation: 'fadeIn 0.3s ease-out',
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
        <span style={{ fontSize: '12px' }}>⛓️</span>
        <span style={{ fontWeight: 700, color: '#92400e' }}>
          #{record.tokenId.toLocaleString()}
        </span>
        <span style={{ color: '#a16207' }}>
          · {record.chainName}
        </span>
        <span style={{ color: '#a16207', fontSize: '10px' }}>
          · {formatRelativeTime(record.publishedAt, t)}
        </span>
        <button
          onClick={() => setShowDetails(!showDetails)}
          style={{
            marginLeft: 'auto',
            padding: '2px 6px',
            background: '#fef3c7',
            border: '1px solid #fde68a',
            borderRadius: '4px',
            color: '#92400e',
            fontSize: '10px',
            cursor: 'pointer',
          }}
        >
          {showDetails ? t('agent.pluginPanel.hide') : t('agent.pluginPanel.details')}
        </button>
      </div>

      {/* Tx hash */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ color: '#64748b', fontSize: '10px', width: '60px' }}>{t('agent.pluginPanel.txLabel')}</span>
        <code style={{ fontSize: '10px', color: '#0f1729', fontFamily: 'monospace', flex: 1 }}>
          0x{record.txHash.substring(0, 16)}...{record.txHash.substring(56)}
        </code>
        <a
          href={record.explorerTxUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#2563eb', fontSize: '10px', textDecoration: 'none' }}
        >
          ↗
        </a>
      </div>

      {/* Block + Gas */}
      <div style={{ display: 'flex', gap: '12px', fontSize: '10px', color: '#64748b' }}>
        <span>{t('agent.pluginPanel.block', { n: record.blockNumber.toLocaleString() })}</span>
        <span>{t('agent.pluginPanel.gasUsed', { gas: record.gasUsed })}</span>
        <span>👤 {shortAddress(record.walletAddress)}</span>
      </div>

      {/* Details */}
      {showDetails && (
        <div
          style={{
            marginTop: '8px',
            padding: '8px',
            background: '#fafaf9',
            borderRadius: '4px',
            fontSize: '10px',
            color: '#475569',
            lineHeight: 1.5,
          }}
        >
          <div style={{ marginBottom: '4px' }}>
            <strong>{t('agent.pluginPanel.shaLabel')}</strong>{' '}
            <code style={{ fontSize: '9px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {record.kcSha256}
            </code>
          </div>
          <div style={{ marginBottom: '4px' }}>
            <strong>{t('agent.pluginPanel.ipfsLabel')}</strong>{' '}
            <a
              href={record.ipfsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#2563eb', fontSize: '10px', wordBreak: 'break-all' }}
            >
              {record.ipfsUrl}
            </a>
          </div>
          <div>
            <strong>{t('agent.pluginPanel.contractLabel')}</strong>{' '}
            <code style={{ fontSize: '9px', fontFamily: 'monospace' }}>
              {shortAddress(RESEARCHKIT_REGISTRY_CONTRACT)}
            </code>
          </div>
          <div>
            <strong>Mode</strong>{' '}
            <span style={{ background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>
              mock (demo)
            </span>
            <span style={{ fontSize: '9px', color: '#94a3b8', marginLeft: '4px' }}>— real SDK in D23/D24</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// 辅助
// ============================================================================

function formatRelativeTime(timestamp: number, t: TFn): string {
  const diff = Date.now() - timestamp
  if (diff < 60_000) return t('agent.pluginPanel.relativeTime.secondsAgo', { n: Math.floor(diff / 1000) })
  if (diff < 3600_000) return t('agent.pluginPanel.relativeTime.minutesAgo', { n: Math.floor(diff / 60_000) })
  if (diff < 86400_000) return t('agent.pluginPanel.relativeTime.hoursAgo', { n: Math.floor(diff / 3600_000) })
  return new Date(timestamp).toLocaleDateString()
}

// ============================================================================
// D33 — BatchToolbar 批量执行工具栏
// ============================================================================

function BatchToolbar({
  selectedCount,
  total,
  running,
  done,
  successes,
  failures,
  current,
  currentPluginId,
  currentPluginName,
  onSelectAll,
  onUnselectAll,
  onRun,
}: {
  selectedCount: number
  total: number
  running: boolean
  done: boolean
  successes: number
  failures: number
  current: number
  currentPluginId: string | null
  currentPluginName: string
  onSelectAll: () => void
  onUnselectAll: () => void
  onRun: () => void
}) {
  const progressPct = running && total > 0 ? Math.round((current / selectedCount) * 100) : 0

  return (
    <div
      style={{
        padding: '12px',
        background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
        border: '1px solid #c4b5fd',
        borderRadius: '8px',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      {/* Top row — 选择 + 执行按钮 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#5b21b6' }}>
          🎯 批量执行队列
        </span>
        <span
          style={{
            fontSize: '10px',
            padding: '2px 8px',
            background: 'white',
            color: '#7c3aed',
            borderRadius: '999px',
            fontWeight: 600,
          }}
        >
          {selectedCount} / {total} 选中
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          <button
            onClick={onSelectAll}
            disabled={running}
            style={{
              padding: '4px 10px',
              background: running ? '#e5e7eb' : 'white',
              color: running ? '#9ca3af' : '#7c3aed',
              border: '1px solid #c4b5fd',
              borderRadius: '6px',
              fontSize: '10px',
              fontWeight: 600,
              cursor: running ? 'not-allowed' : 'pointer',
            }}
          >
            全选
          </button>
          <button
            onClick={onUnselectAll}
            disabled={running}
            style={{
              padding: '4px 10px',
              background: running ? '#e5e7eb' : 'white',
              color: running ? '#9ca3af' : '#7c3aed',
              border: '1px solid #c4b5fd',
              borderRadius: '6px',
              fontSize: '10px',
              fontWeight: 600,
              cursor: running ? 'not-allowed' : 'pointer',
            }}
          >
            清空
          </button>
          <button
            onClick={onRun}
            disabled={running || selectedCount === 0}
            style={{
              ...btnPrimary,
              padding: '4px 14px',
              background: running || selectedCount === 0
                ? '#cbd5e1'
                : 'linear-gradient(135deg, #7c3aed 0%, #9333ea 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: running || selectedCount === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {running ? '⏳ 执行中...' : `▶ 执行全部 (${selectedCount})`}
          </button>
        </div>
      </div>

      {/* Progress bar — 执行中或完成时显示 */}
      {(running || done) && selectedCount > 0 && (
        <div style={{ marginTop: '8px' }}>
          {/* 进度文字 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#5b21b6', marginBottom: '4px', fontWeight: 600 }}>
            <span>
              {running && currentPluginId
                ? `⏳ ${current} / ${selectedCount} — 正在执行 ${currentPluginName}`
                : done
                ? `✅ 完成 — 成功 ${successes} / 失败 ${failures}`
                : `${current} / ${selectedCount}`}
            </span>
            <span>{progressPct}%</span>
          </div>
          {/* 进度条 */}
          <div
            style={{
              height: '6px',
              background: '#e9d5ff',
              borderRadius: '999px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${done ? 100 : progressPct}%`,
                background: done
                  ? (failures > 0 ? 'linear-gradient(90deg, #10b981 0%, #10b981 70%, #ef4444 100%)' : '#10b981')
                  : 'linear-gradient(90deg, #7c3aed 0%, #9333ea 100%)',
                borderRadius: '999px',
                transition: 'width 0.3s ease-out',
              }}
            />
          </div>
        </div>
      )}
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
  selectionMode = false,
  selected = false,
  onToggleSelect,
  batchRunning = false,
  isCurrentInBatch = false,
}: {
  plugin: ExportPlugin
  state: PluginState
  result?: ExportResult
  executing: boolean
  disabled: boolean
  onToggleEnabled: (enabled: boolean) => void
  onConfigChange: (key: string, value: string | boolean) => void
  onExport: () => void
  selectionMode?: boolean
  selected?: boolean
  onToggleSelect?: () => void
  batchRunning?: boolean
  isCurrentInBatch?: boolean
}) {
  const { t } = useI18n()
  const meta = plugin.meta
  const isDisabled = !state.enabled || disabled
  const [showDetails, setShowDetails] = useState(false)
  const category = meta.category || 'export'
  const perms = plugin.permissions
  // D33 — 批量模式下卡片可勾选条件：启用中 + 非 disabled + 非批量执行中
  const selectable = selectionMode && state.enabled && !disabled && !batchRunning

  return (
    <div
      style={{
        padding: '12px 14px',
        background: state.enabled ? (isCurrentInBatch ? '#eff6ff' : 'white') : '#fafbfc',
        border: `2px solid ${
          isCurrentInBatch ? '#3b82f6'
          : result?.success ? '#a7f3d0'
          : result && !result.success ? '#fecaca'
          : selected ? '#a78bfa'
          : '#e2e8f0'
        }`,
        borderRadius: '8px',
        opacity: disabled ? 0.6 : 1,
        transition: 'all 0.2s',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
        {/* D33 — 批量模式 checkbox */}
        {selectionMode && (
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '20px',
              height: '32px',
              flexShrink: 0,
              cursor: selectable ? 'pointer' : 'not-allowed',
            }}
            title={selectable ? '勾选加入批量队列' : (batchRunning ? '批量执行中' : '插件未启用')}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              disabled={!selectable}
              style={{
                width: '16px',
                height: '16px',
                cursor: selectable ? 'pointer' : 'not-allowed',
                accentColor: '#7c3aed',
              }}
            />
          </label>
        )}

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
            {meta.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: '9px',
                  padding: '1px 5px',
                  background: tag === 'official' ? '#dbeafe' : '#f3f4f6',
                  color: tag === 'official' ? '#1e40af' : '#475569',
                  borderRadius: '3px',
                  fontWeight: 600,
                }}
              >
                {tag}
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
        {/* D31 — Category badge */}
        <span
          style={{
            fontSize: '9px',
            padding: '2px 6px',
            background: category === 'export' ? '#dbeafe' : category === 'source' ? '#fef3c7' : '#fce7f3',
            color: category === 'export' ? '#1e40af' : category === 'source' ? '#92400e' : '#9d174d',
            borderRadius: '4px',
            fontWeight: 600,
            border: `1px solid ${category === 'export' ? '#bfdbfe' : category === 'source' ? '#fde68a' : '#fbcfe8'}`,
          }}
        >
          {category}
        </span>
        {/* D31 — 权限摘要 badge（点击展开详情） */}
        {perms && (
          <button
            onClick={() => setShowDetails(!showDetails)}
            style={{
              fontSize: '9px',
              padding: '2px 6px',
              background: showDetails ? '#fef2f2' : '#f8fafc',
              color: '#475569',
              borderRadius: '4px',
              fontWeight: 500,
              border: '1px solid #e2e8f0',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
            }}
            title="查看插件权限声明"
          >
            🔒 perms
            <span style={{ fontSize: '8px' }}>{showDetails ? '▾' : '▸'}</span>
          </button>
        )}
      </div>

      {/* D31 — Permissions 详情面板（可折叠） */}
      {showDetails && perms && (
        <div
          style={{
            marginBottom: '10px',
            padding: '8px 10px',
            background: '#fef2f2',
            borderRadius: '6px',
            border: '1px solid #fecaca',
            fontSize: '10px',
            color: '#7f1d1d',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '9px' }}>
            🔐 权限声明
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', lineHeight: 1.5 }}>
            <div>
              <strong>KC 字段：</strong>{' '}
              {perms.kcFields?.length ? (
                perms.kcFields.includes('*') ? <span style={{ color: '#dc2626', fontWeight: 700 }}>全部（*）</span> : perms.kcFields.join(', ')
              ) : '—'}
            </div>
            <div>
              <strong>外部 API：</strong>{' '}
              {perms.externalApis?.length ? perms.externalApis.join(', ') : '无'}
            </div>
            <div>
              <strong>网络：</strong> {perms.network ? '✅ 需要' : '❌ 不需要'}
            </div>
            <div>
              <strong>文件系统：</strong> {perms.filesystem ? '✅ 需要' : '❌ 不需要'}
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <strong>钱包签名：</strong>{' '}
              {perms.walletSignature ? <span style={{ color: '#dc2626', fontWeight: 700 }}>⚠️ 需要（敏感操作）</span> : '❌ 不需要'}
            </div>
          </div>
        </div>
      )}

      {/* Config form (if requiredConfig) */}
      {meta.requiresConfig && meta.configSchema && meta.configSchema.length > 0 && state.enabled && (
        <div style={{ marginBottom: '10px', padding: '8px', background: '#f8fafc', borderRadius: '6px' }}>
          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {t('agent.pluginPanel.config')}
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

      {/* Action button — 批量模式下隐藏单个按钮 */}
      {!selectionMode && (
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
          {executing ? t('agent.pluginPanel.executing') : t('agent.pluginPanel.executeBtn', { icon: meta.icon })}
        </button>
      )}
      {/* D33 — 批量模式下显示状态条 */}
      {selectionMode && isCurrentInBatch && (
        <div
          style={{
            width: '100%',
            padding: '8px 12px',
            background: '#dbeafe',
            border: '1px solid #93c5fd',
            borderRadius: '6px',
            fontSize: '11px',
            color: '#1e40af',
            fontWeight: 700,
            textAlign: 'center',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          ⏳ 批量执行中...
        </div>
      )}

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
            <span style={{ fontWeight: 600 }}>{result.success ? t('agent.pluginPanel.successLabel') : t('agent.pluginPanel.failureLabel')}</span>
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
            {formatRelativeTime(state.lastExecutedAt, t)}
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
// D32 — MarketplacePanel 远程插件市场
// ============================================================================

function MarketplacePanel() {
  const [expanded, setExpanded] = useState(false)
  const [manifests, setManifests] = useState<PluginManifest[]>([])
  const [installed, setInstalled] = useState<PluginManifest[]>([])
  const [installing, setInstalling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [list, installedList] = await Promise.all([
      loadMarketplace(),
      Promise.resolve(loadInstalledManifests()),
    ])
    setManifests(list)
    setInstalled(installedList)
  }, [])

  useEffect(() => {
    if (expanded && manifests.length === 0) {
      refresh()
    }
  }, [expanded, manifests.length, refresh])

  const handleInstall = useCallback(async (manifest: PluginManifest) => {
    setInstalling(manifest.id)
    setError(null)
    setToast(null)
    const result = await installPlugin(manifest.id)
    if (result.success) {
      setToast(`✅ "${manifest.name}" 安装成功`)
      window.setTimeout(() => setToast(null), 3000)
      // 刷新已安装列表
      setInstalled(loadInstalledManifests())
    } else {
      setError(result.error || '安装失败')
    }
    setInstalling(null)
  }, [])

  const isInstalled = (id: string) => installed.some(m => m.id === id)

  // 按 official 排序：官方在前
  const sorted = [...manifests].sort((a, b) => {
    if (a.official !== b.official) return a.official ? -1 : 1
    return (b.installCount || 0) - (a.installCount || 0)
  })

  return (
    <div
      style={{
        marginTop: '12px',
        padding: '10px 12px',
        background: 'linear-gradient(135deg, #f0f9ff 0%, #faf5ff 100%)',
        border: '1px solid #c4b5fd',
        borderRadius: '8px',
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          color: '#5b21b6',
          fontSize: '12px',
          fontWeight: 700,
        }}
      >
        <span>{expanded ? '▾' : '▸'}</span>
        <span>🌐 Plugin Marketplace</span>
        <span
          style={{
            marginLeft: 'auto',
            background: '#ede9fe',
            padding: '1px 6px',
            borderRadius: '999px',
            fontSize: '10px',
            fontWeight: 600,
            color: '#6d28d9',
          }}
        >
          {manifests.length} 可安装 · {installed.length} 已安装
        </span>
      </button>

      {expanded && (
        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {manifests.length === 0 && (
            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '11px', padding: '12px' }}>
              正在加载市场...
            </div>
          )}

          {sorted.map((m) => (
            <MarketplaceCard
              key={m.id}
              manifest={m}
              installed={isInstalled(m.id)}
              installing={installing === m.id}
              onInstall={() => handleInstall(m)}
            />
          ))}

          {error && (
            <div style={{ padding: '6px 8px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', fontSize: '10px', color: '#991b1b' }}>
              ❌ {error}
            </div>
          )}
          {toast && (
            <div style={{ padding: '6px 8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '4px', fontSize: '10px', color: '#166534' }}>
              {toast}
            </div>
          )}

          <div style={{ marginTop: '4px', fontSize: '9px', color: '#94a3b8', textAlign: 'center' }}>
            v2.3 mock marketplace — 真实远程加载待 v2.4 沙箱化
          </div>
        </div>
      )}
    </div>
  )
}

function MarketplaceCard({
  manifest,
  installed,
  installing,
  onInstall,
}: {
  manifest: PluginManifest
  installed: boolean
  installing: boolean
  onInstall: () => void
}) {
  const category = manifest.category || 'export'
  const rating = manifest.rating || 0

  return (
    <div
      style={{
        padding: '8px 10px',
        background: 'white',
        border: `1px solid ${installed ? '#a7f3d0' : '#e2e8f0'}`,
        borderRadius: '6px',
        display: 'flex',
        gap: '8px',
        alignItems: 'flex-start',
        opacity: installing ? 0.6 : 1,
      }}
    >
      <div
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '6px',
          background: `${manifest.color}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '16px',
          flexShrink: 0,
        }}
      >
        {manifest.icon}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f1729' }}>
            {manifest.name}
          </span>
          <span style={{ fontSize: '9px', padding: '1px 4px', background: '#f1f5f9', color: '#64748b', borderRadius: '3px' }}>
            v{manifest.version}
          </span>
          {manifest.official ? (
            <span style={{ fontSize: '9px', padding: '1px 4px', background: '#dbeafe', color: '#1e40af', borderRadius: '3px', fontWeight: 600 }}>
              official
            </span>
          ) : (
            <span style={{ fontSize: '9px', padding: '1px 4px', background: '#fef3c7', color: '#92400e', borderRadius: '3px', fontWeight: 600 }}>
              community
            </span>
          )}
          <span style={{ fontSize: '9px', padding: '1px 4px', background: '#f8fafc', color: '#475569', borderRadius: '3px' }}>
            {category}
          </span>
        </div>
        <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', lineHeight: 1.4 }}>
          {manifest.description}
        </div>
        <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '3px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <span>⭐ {rating.toFixed(1)}</span>
          <span>📦 {(manifest.sizeKb || 0)} KB</span>
          <span>👤 {manifest.author}</span>
          {manifest.permissions?.walletSignature && (
            <span style={{ color: '#dc2626', fontWeight: 600 }}>⚠️ 需要钱包签名</span>
          )}
        </div>
      </div>

      <button
        onClick={onInstall}
        disabled={installed || installing}
        style={{
          padding: '4px 10px',
          background: installed ? '#dcfce7' : installing ? '#e2e8f0' : btnPrimary.background,
          color: installed ? '#166534' : installing ? '#64748b' : 'white',
          border: 'none',
          borderRadius: '4px',
          fontSize: '10px',
          fontWeight: 700,
          cursor: installed || installing ? 'default' : 'pointer',
          flexShrink: 0,
        }}
      >
        {installed ? '✓ 已装' : installing ? '⏳ 安装中...' : '+ 安装'}
      </button>
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

/**
 * Plugin States — 浏览器端持久化（localStorage）
 *
 * 数据流：
 * - 用户在 PluginPanel 中切换 enabled / 编辑 config
 * - 写入 localStorage 'researchkit:plugin-states'
 * - 下次加载时从 localStorage 恢复
 *
 * 设计：
 * - 不依赖服务端 — 100% 浏览器端
 * - 默认所有插件 enabled=true / config={}
 * - 用户配置覆盖默认值
 */

import type { PluginStates, PluginState, PluginConfig } from '@/types/plugin'

const STORAGE_KEY = 'researchkit:plugin-states'

/**
 * 加载所有插件状态
 * - localStorage 不可用时返回 {}
 * - JSON 解析失败返回 {}
 */
export function loadPluginStates(): PluginStates {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(stripBom(raw))
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as PluginStates
  } catch (err) {
    console.warn('[plugin-states] load failed:', err)
    return {}
  }
}

/**
 * 获取单个插件状态（不存在则返回默认状态）
 */
export function getPluginState(pluginId: string): PluginState {
  const all = loadPluginStates()
  return (
    all[pluginId] || {
      pluginId,
      enabled: true,
      config: {},
    }
  )
}

/**
 * 保存单个插件状态（合并写入）
 */
export function setPluginState(state: PluginState): void {
  if (typeof window === 'undefined') return
  try {
    const all = loadPluginStates()
    all[state.pluginId] = state
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch (err) {
    console.warn('[plugin-states] save failed:', err)
  }
}

/**
 * 启用/禁用插件
 */
export function setPluginEnabled(pluginId: string, enabled: boolean): void {
  const current = getPluginState(pluginId)
  setPluginState({ ...current, enabled })
}

/**
 * 更新插件配置（merge）
 */
export function updatePluginConfig(pluginId: string, config: PluginConfig): void {
  const current = getPluginState(pluginId)
  setPluginState({
    ...current,
    config: { ...current.config, ...config },
  })
}

/**
 * 记录最后一次执行结果
 */
export function recordPluginExecution(
  pluginId: string,
  result: { success: boolean; message: string; url?: string }
): void {
  const current = getPluginState(pluginId)
  setPluginState({
    ...current,
    lastExecutedAt: Date.now(),
    lastResult: result,
  })
}

/**
 * 清空所有插件状态（设置页用，重置按钮）
 */
export function clearPluginStates(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch (err) {
    console.warn('[plugin-states] clear failed:', err)
  }
}

// ============================================================================
// 辅助
// ============================================================================

function stripBom(s: string): string {
  return s.replace(/^\uFEFF/, '')
}

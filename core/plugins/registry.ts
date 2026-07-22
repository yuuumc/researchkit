/**
 * Plugin Registry — 单例注册表
 *
 * v2.2 设计：
 * - 单例模式，整个 app 共享一个 registry
 * - 注册时去重（按 plugin.meta.id）
 * - 支持启用/禁用（默认启用）
 * - 提供查询接口：list() / get(id) / getEnabled()
 *
 * v2.3 D31 扩展：
 * - listByCategory(cat) — 按 category 过滤
 * - triggerLifecycle(event, id, ctx) — 调用插件生命周期钩子
 * - getPermissions(id) — 查询插件权限声明
 *
 * 用法：
 *   import { pluginRegistry } from '@/core/plugins/registry'
 *   import { jsonDownloadPlugin, markdownDownloadPlugin } from '@/core/plugins/sample-plugins'
 *
 *   // 应用启动时注册（仅 server 端或 static init）
 *   pluginRegistry.register(jsonDownloadPlugin)
 *   pluginRegistry.register(markdownDownloadPlugin)
 *
 *   // UI 查询
 *   const plugins = pluginRegistry.list()
 *   const exportPlugins = pluginRegistry.listByCategory('export')
 */

import type { ExportPlugin } from '@/types/plugin'
import type {
  PluginCategory,
  PluginLifecycle,
  PluginLifecycleContext,
  PluginLifecycleEvent,
  PluginLifecycleResult,
  PluginPermissions,
} from '@/types/plugin'

class PluginRegistry {
  private plugins = new Map<string, ExportPlugin>()

  /**
   * 注册插件 — 重复注册（同 id）会被忽略并打印警告
   */
  register(plugin: ExportPlugin): void {
    if (!plugin?.meta?.id) {
      console.warn('[plugin-registry] plugin missing meta.id, skipped')
      return
    }
    if (this.plugins.has(plugin.meta.id)) {
      console.warn(`[plugin-registry] plugin "${plugin.meta.id}" already registered, skipped`)
      return
    }
    this.plugins.set(plugin.meta.id, plugin)
  }

  /**
   * 注销插件
   */
  unregister(id: string): boolean {
    return this.plugins.delete(id)
  }

  /**
   * 查询所有已注册插件（按 meta.id 排序）
   */
  list(): ExportPlugin[] {
    return Array.from(this.plugins.values()).sort((a, b) =>
      a.meta.id.localeCompare(b.meta.id)
    )
  }

  /**
   * D31 — 按 category 过滤插件
   *
   * 未声明 category 的插件视为 'export'（v2.2 默认）
   */
  listByCategory(category: PluginCategory): ExportPlugin[] {
    return this.list().filter(p => (p.meta.category || 'export') === category)
  }

  /**
   * 按 id 获取插件
   */
  get(id: string): ExportPlugin | undefined {
    return this.plugins.get(id)
  }

  /**
   * D31 — 查询插件权限声明
   */
  getPermissions(id: string): PluginPermissions | undefined {
    return this.plugins.get(id)?.permissions
  }

  /**
   * D31 — 触发插件生命周期钩子
   *
   * 钩子未实现时返回 success=true（静默成功）
   * 钩子抛异常时捕获并返回 success=false（不向调用方抛出）
   *
   * @returns 钩子结果；插件不存在或无钩子时返回 success=true
   */
  async triggerLifecycle(
    id: string,
    event: PluginLifecycleEvent,
    ctx: PluginLifecycleContext
  ): Promise<PluginLifecycleResult> {
    const plugin = this.plugins.get(id)
    if (!plugin) {
      return { success: false, error: `Plugin "${id}" not found` }
    }
    const lifecycle: PluginLifecycle | undefined = plugin.lifecycle
    if (!lifecycle) {
      return { success: true, message: 'no lifecycle hooks' }
    }
    const hook = lifecycle[event]
    if (!hook) {
      return { success: true, message: `hook ${event} not implemented` }
    }
    try {
      return await hook.call(lifecycle, ctx)
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      console.warn(`[plugin-registry] lifecycle ${event} for "${id}" failed:`, error)
      return { success: false, error }
    }
  }

  /**
   * 清空所有插件（测试用）
   */
  clear(): void {
    this.plugins.clear()
  }

  /**
   * 已注册插件数量
   */
  get size(): number {
    return this.plugins.size
  }
}

/**
 * 单例 registry — 全 app 共享
 *
 * 注意：插件状态（enabled / config）在 localStorage 中管理（lib/plugin-states.ts），
 * registry 只负责"插件是否存在"，不负责"是否启用"。
 */
export const pluginRegistry = new PluginRegistry()

// P2-7 — initBuiltinPlugins 是 dead code，已删除。
// 实际注册走 components/PluginPanel.tsx:77 的 pluginRegistry.register(p)，
// 避免两条注册路径不一致导致 server-side 跑导出逻辑时插件不在 registry。

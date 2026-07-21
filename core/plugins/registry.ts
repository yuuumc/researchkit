/**
 * Plugin Registry — 单例注册表
 *
 * 设计：
 * - 单例模式，整个 app 共享一个 registry
 * - 注册时去重（按 plugin.meta.id）
 * - 支持启用/禁用（默认启用）
 * - 提供查询接口：list() / get(id) / getEnabled()
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
 */

import type { ExportPlugin } from '@/types/plugin'

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
   * 按 id 获取插件
   */
  get(id: string): ExportPlugin | undefined {
    return this.plugins.get(id)
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

/**
 * 初始化所有内置插件 — 在 app 启动时调用一次
 *
 * v2.2 内置：
 * - json-download: 下载 KC 的 JSON
 * - markdown-download: 下载 KC 的 Markdown
 *
 * v2.3 扩展：
 * - onchain-export: 发布到 X Layer 链上（D13）
 * - notion-publish: 发布到 Notion（社区插件）
 */
export function initBuiltinPlugins(): void {
  // 延迟 import 避免循环依赖
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { jsonDownloadPlugin, markdownDownloadPlugin } = require('./sample-plugins')
  pluginRegistry.register(jsonDownloadPlugin)
  pluginRegistry.register(markdownDownloadPlugin)
}

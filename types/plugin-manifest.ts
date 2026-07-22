/**
 * D32 — Plugin Marketplace Manifest 类型
 *
 * 插件市场 entry 的 schema — 描述一个可安装的插件
 *
 * 与 PluginMeta 的区别：
 * - PluginMeta 是已安装插件的运行时元数据
 * - PluginManifest 是市场列表中的可安装条目，额外包含 install 来源信息
 *
 * v2.3 D32 范围：
 * - manifest 仅做 UI 展示 + 模拟安装（不真实加载远程代码，避免 eval 安全问题）
 * - 真实远程加载留给 v2.4 沙箱化后实现
 *
 * 数据流：
 *   1. UI 调 fetch /api/plugins/marketplace → 返回 PluginManifest[]
 *   2. 用户点 [安装] → POST /api/plugins/install { id } → server 返回完整 PluginMeta
 *   3. client 把 PluginMeta 写到 localStorage（researchkit:installed-plugins）
 *   4. PluginPanel 在 BUILTIN_PLUGINS 之外额外渲染已安装的市场插件
 */

import type { PluginCategory, PluginPermissions } from './plugin'

/**
 * 插件市场 manifest — 单条市场条目
 */
export interface PluginManifest {
  /** 插件 ID（全局唯一） */
  id: string
  /** 显示名 */
  name: string
  /** 描述 */
  description: string
  /** 版本号 */
  version: string
  /** 作者 */
  author: string
  /** emoji 图标 */
  icon: string
  /** 主题色 */
  color: string
  /** 标签 */
  tags: string[]
  /** 类别 */
  category: PluginCategory
  /** 是否需要配置 */
  requiresConfig: boolean
  /** 配置 schema */
  configSchema?: Array<{
    key: string
    label: string
    type: 'text' | 'password' | 'url' | 'select' | 'boolean'
    placeholder?: string
    required: boolean
    defaultValue?: string | boolean
    options?: Array<{ label: string; value: string }>
    helpText?: string
  }>
  /** 主页 URL */
  homepage?: string
  /** 权限声明 */
  permissions?: PluginPermissions
  /** 安装次数（市场统计） */
  installCount?: number
  /** 平均评分（0-5） */
  rating?: number
  /** 是否为官方插件 */
  official: boolean
  /** 下载大小（KB，模拟值） */
  sizeKb?: number
  /** 发布时间（ISO 字符串） */
  publishedAt?: string
}

/**
 * 市场列表响应
 */
export interface MarketplaceResponse {
  manifests: PluginManifest[]
  /** 市场版本 */
  version: string
  /** 最后更新时间 */
  updatedAt: string
}

/**
 * 安装请求
 */
export interface InstallRequest {
  pluginId: string
}

/**
 * 安装响应
 */
export interface InstallResponse {
  success: boolean
  /** 安装后的 PluginMeta（client 用于持久化） */
  manifest?: PluginManifest
  /** 失败原因 */
  error?: string
}

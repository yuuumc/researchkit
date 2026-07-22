/**
 * D32 — Plugin Marketplace Client Wrapper
 *
 * 客户端调用 /api/plugins/marketplace + /api/plugins/install 的封装
 *
 * 数据流：
 * - PluginPanel 在"Marketplace" tab 中调 loadMarketplace() 拉取市场条目
 * - 用户点 [安装] → 调 installPlugin(id) → server 返回 manifest
 * - client 把 manifest 存到 localStorage 'researchkit:installed-manifests'
 * - PluginPanel 主面板在 BUILTIN_PLUGINS 之外渲染已安装的市场插件
 */

import type {
  PluginManifest,
  MarketplaceResponse,
  InstallResponse,
} from '@/types/plugin-manifest'

const MARKETPLACE_URL = '/api/plugins/marketplace'
const INSTALL_URL = '/api/plugins/install'
const INSTALLED_STORAGE_KEY = 'researchkit:installed-manifests'

/**
 * 拉取市场全部条目
 */
export async function loadMarketplace(): Promise<PluginManifest[]> {
  try {
    const res = await fetch(MARKETPLACE_URL, { cache: 'no-store' })
    if (!res.ok) return []
    const data = (await res.json()) as MarketplaceResponse
    if (!Array.isArray(data.manifests)) return []
    return data.manifests
  } catch (err) {
    console.warn('[plugin-marketplace] load failed:', err)
    return []
  }
}

/**
 * 安装插件
 *
 * @returns 成功时返回 manifest；失败时返回 null + error message
 */
export async function installPlugin(
  pluginId: string
): Promise<{ success: boolean; manifest?: PluginManifest; error?: string }> {
  try {
    const res = await fetch(INSTALL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pluginId }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { success: false, error: data.error || `HTTP ${res.status}` }
    }
    const data = (await res.json()) as InstallResponse
    if (!data.success || !data.manifest) {
      return { success: false, error: data.error || 'Install failed' }
    }
    // 持久化到 localStorage
    saveInstalledManifest(data.manifest)
    return { success: true, manifest: data.manifest }
  } catch (err) {
    console.warn('[plugin-marketplace] install failed:', err)
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * 从 localStorage 读取已安装的市场插件 manifest
 */
export function loadInstalledManifests(): PluginManifest[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(INSTALLED_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as PluginManifest[]
  } catch {
    return []
  }
}

/**
 * 持久化一个 manifest 到 localStorage
 */
function saveInstalledManifest(manifest: PluginManifest): void {
  if (typeof window === 'undefined') return
  try {
    const list = loadInstalledManifests()
    // 去重：同 id 覆盖
    const filtered = list.filter(m => m.id !== manifest.id)
    filtered.push(manifest)
    window.localStorage.setItem(INSTALLED_STORAGE_KEY, JSON.stringify(filtered))
  } catch (err) {
    console.warn('[plugin-marketplace] save installed failed:', err)
  }
}

/**
 * 卸载市场插件（从 localStorage 移除）
 */
export function uninstallManifest(pluginId: string): void {
  if (typeof window === 'undefined') return
  try {
    const list = loadInstalledManifests()
    const filtered = list.filter(m => m.id !== pluginId)
    window.localStorage.setItem(INSTALLED_STORAGE_KEY, JSON.stringify(filtered))
  } catch {
    // 静默
  }
}

/**
 * 检查某 manifest 是否已安装
 */
export function isManifestInstalled(pluginId: string): boolean {
  return loadInstalledManifests().some(m => m.id === pluginId)
}

## 概述

D32 — Plugin System v2 (2/3): 插件市场 manifest

Phase 5 Day 2 / 3 — 在 D31 lifecycle/permissions 接口之上构建插件市场（manifest 数据 + API + 客户端封装 + UI 展示）。

## 改动清单

### 新增文件
- `types/plugin-manifest.ts` — PluginManifest 接口（市场条目 schema）
- `lib/persistence/plugin-marketplace-server.ts` — 服务端 manifest 数据（3 内置 + 4 社区 mock）
- `app/api/plugins/marketplace/route.ts` — GET 市场列表 API
- `app/api/plugins/install/route.ts` — POST 模拟安装 API
- `lib/plugin-marketplace.ts` — 客户端封装（fetch + localStorage 持久化）

### 修改文件
- `components/PluginPanel.tsx` — 加 MarketplacePanel + MarketplaceCard 组件

## 设计

### Manifest Schema

```typescript
interface PluginManifest {
  id: string
  name: string
  description: string
  version: string
  author: string
  icon: string
  color: string
  tags: string[]
  category: 'export' | 'source' | 'sync'
  requiresConfig: boolean
  configSchema?: PluginConfigField[]
  homepage?: string
  permissions?: PluginPermissions
  installCount: number
  rating: number  // 0-5
  official: boolean
  sizeKb: number
  publishedAt: number
}
```

### Mock 社区插件（4 个）

| ID | 名称 | 类别 | 权限亮点 |
|---|---|---|---|
| notion-publish | Notion 发布 | export | externalApis: api.notion.com |
| obsidian-publish | Obsidian Vault 同步 | sync | filesystem: true |
| arxiv-source | arXiv 论文源 | source | network: true |
| ipfs-pin | IPFS Pin | export | network + walletSignature ⚠️ |

### 数据流

1. UI mount → `loadMarketplace()` 调 `/api/plugins/marketplace` 拿全部 manifest
2. 用户点安装 → `installPlugin(id)` 调 `/api/plugins/install`（mock 100-500ms 延迟）
3. 安装成功 → manifest 写入 localStorage `researchkit:installed-manifests`
4. UI 切换 "已安装" 视图 → 读 localStorage 显示已安装 manifest

## 验证

- `npx tsc --noEmit` ✅
- `npm run build` ✅
- `/` 路由 41.4 kB / 128 kB First Load JS（与 D31 持平）
- 新增 2 个 dynamic API 路由：`/api/plugins/marketplace`, `/api/plugins/install`

## 依赖

基于 D31 (`feature/d31-plugin-system-v2-interfaces`)，需先合并 PR #41。

## 下一步

D33 — Plugin System v2 (3/3)：批量执行队列（让用户可勾选多个插件一次性导出，串行执行 + 进度可视化）。

## 概述

D33 — Plugin System v2 (3/3): 批量执行队列

Phase 5 Day 3 / 3 — 在 D32 市场之上加批量勾选 + 串行执行 + 进度可视化，完成 Plugin System v2 三部曲。

## 改动清单

### 修改文件
- `components/PluginPanel.tsx` — 批量模式 + BatchToolbar + PluginCard 适配 + executePlugin 抽取

## 设计

### 批量执行流程

```
用户点击"⚡ 批量模式"
  → 每张卡片左侧出现 checkbox
  → 顶部出现 BatchToolbar（全选/清空/执行全部）
用户勾选多个插件
  → 点击"▶ 执行全部 (N)"
  → 串行执行：
     for plugin in queue:
       setBatchProgress(current=i+1, currentPluginId=plugin.id)
       await executePlugin(plugin)
       更新 successes / failures
  → 全部完成：done=true，进度条满格，显示汇总
```

### BatchToolbar 状态

| 状态 | 进度文字 | 进度条颜色 |
|---|---|---|
| 执行中 | ⏳ N / M — 正在执行 <插件名> | 紫色渐变 |
| 完成（全成功） | ✅ 完成 — 成功 N / 失败 0 | 绿色 |
| 完成（部分失败） | ✅ 完成 — 成功 X / 失败 Y | 绿→红渐变 |

### PluginCard 批量模式视觉

- checkbox 在卡片头部左侧（禁用/未启用时灰显）
- 选中 → 边框紫色 `#a78bfa`
- 当前执行中 → 背景蓝色 `#eff6ff` + 边框蓝色 `#3b82f6` + 底部"⏳ 批量执行中..."
- 批量模式下隐藏单个"执行导出"按钮

## 设计决策

1. **串行而非并行**：插件可能竞争浏览器下载队列 + onchain-export 有网络延迟，串行更稳定可预测
2. **onchain-export 不在全选范围**：需要钱包配置，默认不勾选（用户可手动单独勾选）
3. **批量执行中禁用 checkbox**：防止中途修改队列
4. **executePlugin 共用**：从 handleExport 抽取核心逻辑，单次和批量复用同一套执行 + 下载 + 持久化
5. **单次/批量互斥**：handleExport 检查 batchProgress.running，避免冲突

## 验证

- `npx tsc --noEmit` ✅
- `npm run build` ✅
- `/` 路由 42.9 kB / 130 kB First Load JS（+1.5 kB vs D32，BatchToolbar + PluginCard 适配）
- 无新增 API 路由（纯前端逻辑）

## 依赖

基于 D32 (`feature/d32-plugin-marketplace-manifest`)，需先合并 PR #42。

## Plugin System v2 三部曲完成

| Day | PR | 内容 |
|---|---|---|
| D31 | #41 | 接口扩展：category + lifecycle + permissions |
| D32 | #42 | 插件市场：manifest + API + UI |
| D33 | (本 PR) | 批量执行队列：勾选 + 串行 + 进度 |

Phase 5 (Plugin System v2) 完成后进入 Phase 6 (UI 打磨, D34-D35)。

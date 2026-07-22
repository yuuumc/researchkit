## 概述

D34-D35 — UI 打磨: ScrollToTop + 自动滚动 + 滚动进度环

Phase 6 收尾 — v2.3 路线图最后的功能性 PR。

## 改动清单

### 新增文件
- `components/ScrollToTop.tsx` — 浮动回到顶部按钮 + SVG 滚动进度环

### 修改文件
- `app/page.tsx` — import ScrollToTop + 结果区加 id + KC 生成后自动滚动 + 最外层加 ScrollToTop

## 功能

### ScrollToTop 组件

```
页面滚动 < 400px  → 按钮隐藏
页面滚动 > 400px  → 按钮浮现（fade + slide up）
                   外圈进度环显示滚动百分比（indigo→cyan 渐变）
点击按钮          → 平滑滚动到顶部
hover             → 抬升 + 发光 + 背景变 indigo
```

### KC 生成后自动滚动

```
用户提交 → Agent 执行 → KC 生成完成
  → setTimeout(200ms)
  → document.getElementById('result-section')?.scrollIntoView({ behavior: 'smooth' })
  → 页面平滑滚到结果区
```

## 验证

- `npx tsc --noEmit` ✅
- `npm run build` ✅
- `/` 路由 43.7 kB / 131 kB First Load JS（+0.8 kB vs D33）
- 无新增 API 路由（纯前端组件）

## 依赖

基于 D33 (`feature/d33-batch-execution-queue`)，需先合并 PR #43。

## v2.3 路线图总结

| Phase | Day | PR | 内容 |
|---|---|---|---|
| 1 | D22 | #34 | OKX Agentic Wallet 接入 |
| 2 | D25-D26 | #35, #36 | AsyncLocalStorage + Knowledge Graph DAG |
| 3 | D27-D29 | #37, #38, #39 | Streaming + 持久化 |
| 4 | D30 | #40 | Smart Suggestion v2 (LLM) |
| 5 | D31-D33 | #41, #42, #43 | Plugin System v2 (lifecycle + market + batch) |
| 6 | D34-D35 | (本 PR) | UI 打磨 (ScrollToTop + 自动滚动) |
| 7 | D36-D40 | (已完成) | i18n 重构 |

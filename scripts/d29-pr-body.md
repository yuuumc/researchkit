# D29 — 持久化下沉到 server-side

## 概述

Phase 3 Day 3 — 把 KC History 和 Cost History 从 client-side localStorage 迁移到 server-side 文件持久化，让数据能在不同设备/浏览器间共享，同时为后续 v2.4 OKX Onchain 上链做准备。

## 改动

### 1. 新增 server-side 持久化层

新增 `lib/persistence/` 目录（server-only，使用 `fs.promises`）：

- `kc-history-server.ts` — KC 历史 server-side 实现
  - 文件：`.researchkit-data/kc-history.json`
  - 容量：最近 10 篇（FIFO，自动去重）
  - 原子写入：tmp 文件 + rename
- `cost-history-server.ts` — Cost 历史 server-side 实现
  - 文件：`.researchkit-data/cost-history.json`
  - 容量：最近 50 条（FIFO）

### 2. 新增 API 路由

- `app/api/history/kc/route.ts`
  - `GET` → listKCHistory
  - `POST` → appendKCHistory
  - `DELETE` → clearKCHistory / removeKCHistory（按 query.id）
- `app/api/history/cost/route.ts`
  - `GET` → listCostHistory
  - `POST` → appendCostHistory
  - `DELETE` → clearCostHistory

### 3. 改造 client wrapper

`lib/kc-history.ts` / `lib/cost-history.ts`
- 函数签名改为 `Promise<T>` 返回
- 实现改为 fetch 调用 API 路由
- 函数名 + 类型保持不变，调用方只需加 `await`

### 4. 调用方加 await

- `app/page.tsx` — `appendCostRun` / `appendKCToHistory` / `loadKCHistory` 加 await
- `components/CompareTab.tsx` — `refresh` 改为 async，`loadKCHistory` 加 await
- `components/settings/tabs/CostTab.tsx` — `refresh` / `handleClear` 改为 async

### 5. .gitignore

新增 `.researchkit-data/` 排除（避免运行时数据进仓库）

## 设计取舍

- **不做自动迁移**：v2.2 之前的 localStorage 数据不自动迁移到 server-side，避免迁移逻辑复杂化（用户首次访问后重新累积）
- **保留函数签名**：仅 sync → async，不重命名函数，最小破坏调用方
- **server 端用 fs**：不引入 SQLite/LevelDB 等数据库，保持部署简单（hackathon 评委场景）
- **未改 memory.ts**：memory tool 已经是 server-side（fs.writeFile），不动

## 验证

- `npx tsc --noEmit` ✅
- `npm run build` ✅ — `/` 路由 38.6 kB / 126 kB First Load JS（与 v2.2 持平）
- 新增 2 个 dynamic API 路由

## 评委可视化效果

- KC 历史 + Cost 历史 评委跨设备共享（不再依赖单一浏览器 localStorage）
- 后续可平滑接入 OKX Onchain 上链（v2.4）

# D28 — SSE 协议升级 + Coordinator 透传 onAgentToken

## 概述

Phase 3 Day 2 — 把 D27 的 `provider.chatStream()` 能力贯穿到 Coordinator → Planner / Reflection / Replan → SSE → 前端，实现"AI 实时思考"逐 token 渲染效果。

## 改动

### 1. Coordinator 透传 onAgentToken

`core/orchestration/coordinator.ts`
- `CoordinatorInput` 新增 `onAgentToken?: (agent: string, delta: string) => void`
- `coordinate()` 提取 `onAgentToken` 并传给 `runPlanner()` / `runReflectionLoop()`

### 2. 三个 text-mode Agent 启用流式

`lib/planner.ts`
- `PlannerAgent.handleMessage` — 检测 `payload.on_agent_token`，若有则改用 `provider.chatStream(messages, opts, { onToken })`
- `reflect()` — 新增 `onAgentToken?` 参数，相同模式流式（agent='Reflection'）
- `replan()` — 新增 `onAgentToken?` 参数，相同模式流式（agent='Replan'）

> JSON-mode Agent（Reader/Analyzer/Terminology/KB/Recommendation/Export）不流式，保持 `provider.chat()`。

### 3. orchestration 透传链

- `core/orchestration/planner.ts` — `runPlanner()` 新增 `onAgentToken?` 参数，通过 `on_agent_token` 字段传给 PlannerAgent
- `core/orchestration/workflow.ts` — `runReflectionLoop()` 新增 `onAgentToken?` 参数，传给 `reflect()` 和 `replan()`

### 4. SSE 协议新增 `agent_token` 事件

`app/api/research/multi-agent-stream/route.ts`
- 在 `coordinate()` 调用时传入 `onAgentToken` 回调
- **节流 buffer**：每 30ms 把累积的 delta 按 agent 合并后 flush 一次，避免 token 密集（如代码块）时前端 EventSource 压力过大
- 流结束前在 `finally` 兜底 flush 一次，避免最后一批 delta 丢失

### 5. 前端 Live Thoughts 浮窗组件

新增 `components/LiveThoughts.tsx`（200 行）
- 右下角固定浮窗，玻璃态深色背景
- 每个 agent 一块，展示 raw token 文本 + 闪烁光标
- header 可点击折叠/展开
- active=false 时延迟 2.5s 淡出，避免闪烁
- hover 浮起 + 边框发光

`app/page.tsx`
- 新增 `liveThoughts` / `liveThoughtsActive` state
- 用 `useRef<Map>` 累积 delta + 60ms throttle setState，避免每个 token 触发 re-render
- SSE 解析循环新增 `agent_token` 分支
- handleSubmit 结束（finally）flush 最后一批 + `setLiveThoughtsActive(false)`

## 验证

- `npx tsc --noEmit` ✅
- `npm run build` ✅ — `/` 39.9 kB / 127 kB First Load JS（LiveThoughts 仅 ~3 kB gzip）

## 评委可视化效果

- 文本/URL 模式提交后，右下角浮窗实时显示 Planner 的"思考过程"（JSON 流式生成），Reflection 不满意时浮窗自动追加 Replan 的补调推理
- 评委能直观看到"AI 在思考"而非等待空白
- 浮窗可折叠不打扰主流程，2.5s 后自动淡出

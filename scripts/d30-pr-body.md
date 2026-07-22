# D30 — Smart Suggestion v2

## 概述

Phase 4 — Smart Suggestion 从 v1 启发式评分升级到 v2 LLM 判断。让 LLM 用自然语言理解论文相关性，给出更准确的 bestMatch 和更人性化的 reasons，提升评委看到的"AI 智能"成色。

## 改动

### 1. 新增 LLM 判断 prompt

新增 `prompts/smart-suggestion.ts`
- 系统提示：You are an academic advisor
- 输出 JSON schema：bestMatchId / score / reasons / relationType
- 强调中文 reasons + 简洁具体

### 2. 新增 server-side LLM 实现

新增 `lib/server-smart-suggestion.ts`
- `computeSmartSuggestionLLM(currentKC, history, title?)`
- 用 provider.chat with `responseFormat: 'json_object'`, `temperature: 0.2`
- 输入：currentKC 摘要 + history top 5 篇摘要（避免 prompt 过长）
- 输出：SmartSuggestion（与 v1 接口一致）
- 失败时抛错，由调用方决定 fallback

### 3. 新增 API 路由

新增 `app/api/research/smart-suggestion/route.ts`
- POST `/api/research/smart-suggestion`
- body: `{ currentKC, history }`
- 内部自动 fallback：LLM 失败时调 v1 启发式 `computeSmartSuggestion`
- 返回 `{ ...suggestion, source: 'llm' | 'heuristic-fallback' }`

### 4. AgentName 扩展

`core/prompt/types.ts`
- AgentName 新增 `'SmartSuggestion'`（让 PromptBuilder 接受）
- 让 D6 Cost Dashboard 能统计 SmartSuggestion 调用的 token

### 5. 前端调用方改造

`app/page.tsx`
- import `computeSmartSuggestion as computeSmartSuggestionHeuristic`（保留 v1 作为 fallback）
- Smart Suggestion 调用改为：
  1. 优先 fetch `/api/research/smart-suggestion` (LLM v2)
  2. fetch 失败或网络异常时 fallback 到 `computeSmartSuggestionHeuristic` (v1)
- 类型签名 `SmartSuggestion` 不变，SmartSuggestionBanner 组件无需改动

## 设计取舍

- **不直接丢弃 v1 启发式**：保留作为 LLM 失败/限流时的 fallback，保证 banner 不丢功能
- **不流式（D27/D28 chatStream）**：SmartSuggestion 调用是一次性 JSON，不需要逐 token 渲染
- **temperature 0.2**：低温度保证相关性判断稳定，不发散
- **top 5 history**：避免 prompt 过长（5 篇约 1500 tokens），同时覆盖最常见场景

## 验证

- `npx tsc --noEmit` ✅
- `npm run build` ✅ — `/` 路由 38.8 kB / 126 kB First Load JS
- 新增 `/api/research/smart-suggestion` 动态路由

## 评委可视化效果

- 生成新 KC 后，banner 显示 "Same field: NLP" 等 LLM 生成的中文 reasons
- 不再是机械的"Shared 3 key terms"，而是有上下文的人话判断
- LLM 失败时静默 fallback 到启发式，用户体验无感知

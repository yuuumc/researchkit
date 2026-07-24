# Changelog

All notable changes to ResearchKit are documented in this file.

## [2.4.0] — 2026-07-24

### Major: From "Tool" to "Agent Service"

ResearchKit now exposes a **multi-step research Agent** that takes a high-level
goal (not a single paper) and autonomously decomposes it into web / arxiv /
multi-agent deep-dive / memory-recall steps, then synthesizes a grounded
answer with `[1]/[2]/...` inline citations. Sessions are persisted so users
can resume a research thread, and the Agent is callable both as an SSE
endpoint and as an MCP `agent_run` tool for external ASP/MCP clients.

### Added

- `core/agent-loop/orchestrator.ts` — `runAgent()`: Planner → Step Executor → Synthesizer loop
  - Planner LLM decomposes goal into 2-6 steps
  - Step kinds: `multi-agent` (reuses v2.3.3 6-agent pipeline via `coordinate()`), `web`, `arxiv`, `memory-recall`
  - Synthesizer LLM writes final answer with inline citations
  - Error isolation: any single step failure does not abort the loop
- `lib/persistence/session-store.ts` — JSON file persistence
  - Local: `.researchkit-data/agent-sessions.json`
  - Vercel: `/tmp/researchkit-data/agent-sessions.json`
  - FIFO of 50 sessions, dedup by (title + source)
- `app/api/agent/run/route.ts` — `POST /api/agent/run` (SSE)
  - Mirrors v2.3.3 multi-agent-stream safety: 58s Vercel timeout, abort-aware, ping-first flush
  - Rate limit: 10/min/IP (same as multi-agent-stream)
  - Events: `ping` → `stage` → `agent_token` → `result` / `error`
- `app/api/agent/sessions/route.ts` — list (GET) / create (POST)
- `app/api/agent/sessions/[id]/route.ts` — get (GET) / delete (DELETE)
- `lib/tools/agent_run.ts` — MCP `agent_run` tool (synchronous, same-process call to `runAgent()`)
- `core/agent-loop/index.ts` — public exports
- `docs/v2.4.0-architecture.md` — design document

### Changed

- `lib/tools/registry.ts` — registered `agent_run` tool
- `app/api/tools/call/route.ts` — added `agent_run` to PUBLIC_TOOLS
- `package.json` — version bump 2.3.3 → 2.4.0
- `app/api/health/route.ts` — version 2.3.3 → 2.4.0
- `components/settings/tabs/AboutTab.tsx` — version badge 2.3.3 → 2.4.0
- `core/plugins/onchain-export.ts` — plugin version 2.3.3 → 2.4.0
- `locales/{zh-CN,en-US}/home.json` — footer version v2.3.3 → v2.4.0
- `components/PluginPanel.tsx` — mock-install prompt v2.3.3 → v2.4.0

### Added (UI integration + i18n)

- `components/AgentRunForm.tsx` — form component (goal / locale / maxSteps / sessionId), embedded in main UI's Agent Run tab
- `components/AgentRunTimeline.tsx` — timeline visualization with i18n, status badges, step details, final answer + references
- `components/SessionHistoryDrawer.tsx` — right-side vertical button + slide-in drawer with session list + detail view, relative timestamps
- `locales/{zh-CN,en-US}/agent-run.json` — new `agentRun` i18n namespace (tab / form / status / step / references / drawer)
- `lib/i18n.ts` — registered `agentRun` namespace
- `releases/v2.4.0-release-notes.md` — release notes

### Fixed (critical)

- `lib/usage-collector.ts` — `beginCollection()` made **idempotent**: nested calls (e.g. `runAgent` → `coordinate`) reuse the outer collector instead of creating a new one via `enterWith`. Previously, the inner collector overwrote the outer ALS store, causing Planner / Synthesizer cost records to be lost → all costs showed as $0.0000.
- `core/agent-loop/orchestrator.ts` — per-step `costUsd` now computed as a **delta** (records after `coordinate()` − records before), preventing cumulative double-counting when `coordinate()` returns `totalCostUsd` (which is cumulative across all agents).
- `app/api/agent/run/route.ts` — inject `outputLocale` from user preferences into `AgentLoopInput`, so the General Tab "Output Language" setting now applies to the Synthesizer LLM output (previously hardcoded to source locale).
- `lib/tools/web_search.ts` — switched primary source to Wikipedia OpenSearch API (DuckDuckGo anti-bot challenge was returning empty results); DuckDuckGo kept as fallback.
- `lib/tools/arxiv.ts` — fixed `action: 'search'` missing + `maxResults` → `limit` / `max_results` parameter name mismatch.
- `components/AgentRunTimeline.tsx` — optional chaining for `r.materialId?.slice(0, 18) || 'mat_?'` + `Array.isArray()` checks for `references` and `steps` fields (prevents `Cannot read properties of undefined (reading 'slice')` crash).

### Removed

- `app/playground/agent/page.tsx` — standalone Playground route removed; Agent Run form + timeline merged into main UI's "Agent Run" tab (top toggle: `研究 / Agent Run`). No more experience split.

### UI polish

- Settings FAB repositioned: `top: 20px` → `top: 80px` (avoid overlapping the `研究 / Agent Run` tab toggle).
- Sessions button: right-side vertical floating button (purple gradient, `writing-mode: vertical-rl` + `text-orientation: upright`), session count badge in drawer header.
- Session drawer mask: `inset: 0` → `top: 60px; left/right/bottom: 0` (top bar stays visible and clickable; Settings FAB no longer blocked).
- Drawer z-index: mask `9999`, detail modal `10001` (above Settings FAB `1000`).

### Compatibility

- Existing `/api/research/multi-agent-stream` endpoint **unchanged** — still free, still works
- Existing `/api/tools/call` for `web_search` / `arxiv` / `memory` / `filesystem` **unchanged**
- ASP #6853 listing metadata still valid (endpoint URL, description, pricing) — no listing change required
- Stage-3 performance logic in v2.3.2-perf **untouched** — `coordinate()` is the stable contract
- No new env vars required (uses `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `LLM_MODEL`)

### Deferred to v2.5

- x402 paid version + X Layer USDT0 settlement (decision: keep free, defer)
- A2A / AgentCard protocol for inter-agent discovery
- Replace JSON file session store with persistent DB (Postgres / SQLite)
- Async job queue for long-running agent runs (Vercel 60s limit)

## [2.3.3] — 2026-07-22

(See prior history in `docs/archive/`. Key features: example cache replay, 6-agent pipeline,
multi-provider LLM, plugin marketplace, i18n zh/en, 9 LLM providers.)

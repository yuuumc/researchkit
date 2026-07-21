# Changelog

All notable changes to ResearchKit OS are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [v2.1] — 2026-07-21 — Model Provider Abstraction + Agent Studio

> 7-day incremental extension (D1-D7) of v2.0. Transforms the rigid v2.0 (hardcoded DeepSeek SDK) into a configurable Agent Studio — judges and users can switch LLM providers, customize prompts, select role presets, and view token costs in the Settings UI without touching code.

### Added — LLM Provider Abstraction (D1-D2)
- **`LLMProvider` interface** (`core/llm/provider.ts`) — `chat(messages, options): Promise<ChatResponse>` unified entry; `ChatResponse` includes `content / model / usage (ChatUsage) / finishReason / durationMs`
- **`ProviderFactory`** — three creation paths: `create(config)` / `fromEnv()` / `fromUserConfig(cookie)`
- **`OpenAICompatProvider`** (`core/llm/providers/openai-compat.ts`) — covers 9 vendors (DeepSeek / OpenAI / OpenRouter / Groq / SiliconFlow / Volcano / DashScope / Hunyuan / Custom) via single OpenAI SDK wrapper
- **`getServerProvider()`** — server-side entry that reads user cookie first, falls back to env vars
- **`MODEL_PRICING` table + `estimateTokenCost()`** — local cost estimation (no API)
- 10 LLM calls migrated from `openai.chat.completions.create` to `provider.chat()` (lib/llm.ts + 4 agents + lib/planner.ts)

### Added — Settings UI 5 Tabs (D3-D6)
- **`SettingsContainer`** (`components/settings/SettingsContainer.tsx`) — tabbed interface with 5 tabs
- **Provider Tab** — provider type dropdown / API key / base URL / model / Test Connection button (calls `healthCheck()`)
- **Prompt Tab** — 6 agents' Project Extension editors (Reader / Analyzer / Terminology / KB / Recommendation / Planner)
- **General Tab** — 5-role Preset dropdown + Output Locale dropdown (auto / zh-CN / en-US / ja-JP / ko-KR / fr-FR / de-DE / es-ES)
- **Cost Tab** — 4 Summary Cards + Per-Agent Breakdown table (with token bars) + Recent Runs table (last 50 runs)
- **About Tab** — version info
- localStorage + cookie dual-write for all user prefs (server-side reads via `next/headers cookies()`)

### Added — PromptBuilder 3-Layer Architecture (D4)
- **`core/prompt/PromptBuilder.ts`** — composes final prompt as: System 🔒 → Preset 🎭 → Project ➕ → User ➕
- `MAX_PROMPT_LENGTH = 8000` — auto-trim on overflow (drops User first, then Project; System never dropped)
- Each Agent has independent Project Extension (configurable in Prompt Tab)

### Added — 5-Role Preset (D5)
- **`config/presets.ts`** — Academic (default) / Beginner / Developer / Researcher / Product Manager
- Each preset injects a `persona` directive into the System prompt
- **`getEffectiveOutputLocale()`** — `'auto'` follows detected source language, otherwise forces user-specified locale
- Backward compatible: default `preset='academic'` + `outputLocale='auto'` matches v2.0 behavior exactly

### Added — Cost & Token Dashboard (D6)
- **`lib/usage-collector.ts`** — module-level `UsageCollector` + `beginCollection/endCollection/recordUsage/setCurrentAgent`
- Auto-records every `provider.chat()` call (via `recordUsage()` hook in `OpenAICompatProvider.chat()`)
- `coordinator.coordinate()` wraps entry/exit with `beginCollection/summarize/endCollection`
- `CoordinatorOutput` extended with `totalUsage / totalCostUsd / perAgentUsage`
- SSE `result` event metadata now includes `total_tokens / total_prompt_tokens / total_completion_tokens / total_cost_usd / per_agent_usage`
- **`components/AgentTimeline.tsx`** — extracts 234 lines from app/page.tsx; adds top summary bar (`Total: 26.8k tokens · $0.0058 · 9 agents · 111.5s`) and per-agent token bars (color-coded by Agent)
- **`lib/cost-history.ts`** — localStorage FIFO 50 records + `summarizeCostHistory()` aggregator
- **`app/page.tsx`** — auto-persists each successful pipeline run to cost-history (for CostTab display)

### Changed
- All Agents now call `provider.chat()` instead of `openai.chat.completions.create` directly
- All Prompts now go through `PromptBuilder.build()` (System + Preset + Project + User composition)
- app/page.tsx shrunk by ~240 lines (Agent Pipeline extracted to AgentTimeline component)

### Smoke Test Results (D7)
- **Text mode**: Transformer abstract → success, 9/9 steps passed, total_tokens=26802, total_cost_usd=$0.0058, per_agent_count=6, markdown/obsidian/mindmap all populated
- **Batch mode**: 2 Wikipedia URLs → 2/2 success
- **URL mode**: Wikipedia Attention → 30,096 chars fetched successfully
- **Settings**: 5 Tabs render OK (Provider/Prompt/General/Cost/About)
- **Health endpoint**: 9 agents, 4 MCP tools, all green
- **tsc --noEmit**: 0 errors

### Known Limitations (v2.2 roadmap)
- Parallel Agent execution creates a race on `currentAgentName` — Reader/Analyzer/KnowledgeBuilder token attribution may merge into Terminology (last setter wins). **Totals are correct**, per-agent attribution is not. v2.2 will use `AsyncLocalStorage`.
- Cost history is localStorage-only (no cross-device sync)
- Prompt Project Extension is global, not per-document

### PRs Merged
- [#8](https://github.com/yuuumc/researchkit/pull/8) feat(provider): D1 — LLMProvider Interface 抽象层
- [#9](https://github.com/yuuumc/researchkit/pull/9) feat(provider): D2 — OpenAICompatProvider + 10 处 LLM 调用迁移
- [#10](https://github.com/yuuumc/researchkit/pull/10) feat(settings): D3 — Settings UI 分 Tab + Provider 配置
- [#11](https://github.com/yuuumc/researchkit/pull/11) feat(prompt): D4 — PromptBuilder 3 层架构 + Prompt Tab
- [#12](https://github.com/yuuumc/researchkit/pull/12) feat(prompt): D5 — Prompt Preset (5 personas) + Output Language
- [#13](https://github.com/yuuumc/researchkit/pull/13) feat(cost): D6 — Cost & Token Dashboard + Agent Timeline 升级

### Operational
- OKX AI Genesis Hackathon submission baseline (deadline 2026-07-28 07:59 Beijing time)
- Demo: researchkit-mu.vercel.app

---

## [v2.0] — 2026-07-20 — Multi-Agent OS

### Added
- **Multi-Agent OS architecture** — 6-agent pipeline (Planner / Reader / Analyzer / Terminology / KnowledgeBuilder / Recommendation / Export) coordinated via `lib/coordinator.ts`
- **Adaptive Prompt** — Planner LLM dynamically decides which agents to invoke based on input type (paper / URL / PDF / batch)
- **Critic Agent (Reflection + Replan loop)** — self-evaluation against quality benchmarks; auto-invokes Replan with `temperature: 0.2` to fill identified gaps
- **4-intent Recommendation Engine** — `improve / challenge / apply / survey` follow-up directions with reasons citing original paper contributions
- **Terminology DAG** — terms include `importance` and `prerequisite` fields for dependency graph construction
- **Locale-aware two-stage architecture** — `lib/locale.ts` detects source language, all agents reason in source language then render in target language
- **A2A service endpoint** — `POST /api/research/multi-agent-stream` with SSE streaming for real-time progress
- **MCP tool registry** — pluggable tools (arxiv / web_search / filesystem / memory) via `lib/tools/registry.ts`
- **Batch URL processing** — `POST /api/research/batch` with configurable concurrency

### Changed
- UI upgraded to Accordion + Simple/Advanced dual mode
- 15+ micro-animations (hover lift / click ripple / staggered entry / breathing logo / glow pulse)
- Mermaid escape hardening — reserved characters `()[]{}|:#` replaced to prevent parser errors
- Knowledge Graph default two-level expandable view

### Fixed
- Planner empty JSON output now throws and falls back to `fallbackPlan` (full 6-agent pipeline)
- PDF parsing CommonJS compatibility via `experimental.serverComponentsExternalPackages`
- SSRF protection in `fetch-url` endpoint
- Double `controller.close()` in SSE route
- API key leakage in error messages

### Operational
- **ASP #6853** registered on OKX.AI Marketplace (A2A, Free tier)
- Deployed to Vercel: `researchkit-mu.vercel.app`
- X participation post: https://x.com/yuuumc0001/status/2079128607688167748

---

## [v1.1] — 2026-07-19 — Reflection + Planner

### Added
- **Planner agent** — `lib/planner.ts` with LLM-driven dynamic step planning
- **Reflection module** — post-execution quality scoring (completeness / confidence / evidence)
- **Replan agent** — gap-filling re-invocation when reflection score < threshold
- **Language Router in Coordinator** — locale detection propagates `language_directive` to all agents
- **SSRF protection** in `fetch-url` endpoint (block private IP ranges)
- **PDF size pre-validation** (reject > 20 MB before parsing)

### Changed
- All prompts upgraded with `persona` + `GOOD/BAD` quality benchmarks (reader / analyzer / terminology / recommendation)
- Few-shot examples restored as structure-only anchors (decoupled from output language)
- UI labels locale-aware (`zh-CN` → Chinese, others → English)
- Error messages no longer leak API keys
- Removed dead code and debug logs

---

## [v1.0] — 2026-07-19 — Knowledge Card Foundation

### Added
- **Knowledge Card** — structured output with:
  - Authors / Field / Year / Difficulty / Reading Time
  - Takeaway / Why It Matters / What Surprised Me / Who Should Read
  - Research Goals / Innovation / Methodology / Experiments / Results / Limitations
  - Future Work / Applications / Datasets
  - Quality / Completeness / Confidence / Evidence scores
- **Markdown export** — full knowledge card rendered as GitHub-flavored Markdown
- **Mindmap export** — Mermaid `mindmap` syntax with escape hardening
- **Three input modes** — text / URL / PDF upload
- **DeepSeek LLM integration** — `deepseek-v4-flash` via OpenAI-compatible SDK
- **Next.js 14 App Router** project skeleton with TypeScript
- **Basic UI** — single input, generate button, render knowledge card
- **`start.bat` launcher** with `package.json` / `node_modules/next` / `next` binary validation
- **`.env.local.example`** template for DeepSeek config

### Project
- Initial commit
- Repository: https://github.com/yuuumc/researchkit
- Tech stack: Next.js 14 / React 18 / TypeScript / DeepSeek

---

## Versioning Policy

| Version bump | When |
|---|---|
| **Major (x.0)** | Architecture-level changes (new agent roles, new protocol) |
| **Minor (1.x)** | New features in existing architecture (new export, new input mode) |
| **Patch (1.0.x)** | Bug fixes, prompt tuning, UI polish |

---

## Links

- [Roadmap](./roadmap.md)
- [Demo](https://researchkit-mu.vercel.app)
- [ASP on OKX.AI](https://www.okx.ai/agents/6853)
- [GitHub](https://github.com/yuuumc/researchkit)

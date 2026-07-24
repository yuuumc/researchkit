# ResearchKit OS — AI Research Operating System

> Multi-agent research pipeline that turns any paper into a structured knowledge card —
> chat with it, compare it, explain it, anchor it onchain.
> Built for **OKX AI Genesis Hackathon** — ASP #6853 on [OKX.AI](https://www.okx.ai/agents/6853).

![version](https://img.shields.io/badge/version-v2.3.3-blue)
![status](https://img.shields.io/badge/status-live-brightgreen)
![i18n](https://img.shields.io/badge/i18n-zh--CN%20%2F%20en--US-orange)
![tests](https://img.shields.io/badge/regression-10%2F10-brightgreen)
![license](https://img.shields.io/badge/license-MIT-green)

🌐 **Live demo**: https://researchkit-mu.vercel.app
📦 **Latest release**: [v2.3.3 — Example cache + demo replay engine](https://github.com/yuuumc/researchkit/releases/tag/v2.3.3)

📖 **Docs**: [CHANGELOG](./docs/CHANGELOG.md) · [v2.3.3 Release Notes](./releases/v2.3.3-release-notes.md) · [v2.3.2 Release Notes](./releases/v2.3.2-release-notes.md) · [Branching](./docs/BRANCHING.md)

---

## Quick Stats (v2.3.3)

| Metric | Value |
|---|---|
| Regression test pass rate | **100%** (10/10 papers × 2 locales = 20 runs, 5 langs × 5 domains) |
| Avg tokens / Knowledge Card | 14,569 |
| Avg cost / Knowledge Card | $0.0028 |
| **"Load Example" cache replay wall time** | **~10-15s** (vs 30-90s live, 4-5x speedup) |
| SSE first-byte latency | < 100ms |
| Production build (First Load JS) | 126 kB |
| LLM providers supported | 9 (DeepSeek / OpenAI / OpenRouter / Groq / SiliconFlow / Volcano / DashScope / Hunyuan / Custom) |
| i18n locales | 2 (zh-CN / en-US), 6 namespaces, zero-dependency `t()` system |
| Built-in / community plugins | 3 built-in + 4 community mock (manifest-driven marketplace) |
| TypeScript errors | 0 |

---

## What it does

Paste any paper, document, or URL → a team of 6 AI agents reads, analyzes, and synthesizes it into a structured **Knowledge Card** — then you can **chat** with it, **compare** it with another paper, **explain** it to any audience, and **anchor** it onchain.

### Knowledge Card

- 🎯 **Takeaway** — the one-sentence core conclusion you'll remember in a year
- 💭 **Why It Matters** — significance, novelty, impact
- ✨ **What Surprised Me** — the most counterintuitive finding
- 👥 **Who Should Read** — specific reader profiles (not "researchers" or "students")
- 🔤 **Terminology DAG** — knowledge graph where each term links to its prerequisites
- 📚 **4-intent Recommendations** — follow-up papers across `improve` / `challenge` / `apply` / `survey`
- 📤 **Export** — Markdown / Obsidian / JSON / Onchain (X Layer)

### Interactive features

- 💬 **Chat with Knowledge Card** — ask follow-up questions, KC context injected (temperature 0.4)
- 📊 **Compare Papers** — 6-dimension comparison (field / methodology / key_contributions / strengths / limitations / complexity) + dual-color radar chart
- 🎓 **Explain Agent** — 4 audience-driven explanations (high_school / software_engineer / researcher / product_manager)
- ⚡ **Smart Suggestion v2 (D30)** — LLM-driven similar KC recommendation with heuristic fallback
- 🔌 **Plugin System v2 (D31-D33)** — manifest-driven marketplace + batch execution queue
- ⛓️ **Onchain Export (Dual Mode, D22)** — mock/real swappable via 6 interfaces (TxSigner / IpfsUploader / NonceProvider / GasEstimator / ContractCaller / WalletConnector)
- 🧪 **Prompt Playground** — 4 presets + temperature / maxTokens / responseFormat controls
- 🌐 **Full i18n (D36-D40)** — 4-layer language separation architecture + LanguageDetectBanner

### v2.3.3 Highlights

#### Performance — Example cache + demo replay engine
- **Problem**: The "Load Example" button triggers the full 7-stage pipeline, which takes 30-90s live and easily trips the 58s `Promise.race` timeout guard under Vercel's 60s hard kill.
- **Solution**: Example content is fixed → precompute + three-layer cache (in-process Map + repo fixture + runtime fs) + demo replay engine (replays recorded stage + token events on a scaled timeline).
- **Result**: "Load Example" drops from 30-90s to **~10-15s** (4-5x speedup), `cacheHit=true`, zero output quality loss (the cache holds the real LLM output).
- **Strict cache key**: `sha256(normalize(content)) + providerType + model + outputLocale + preset` — only example content can hit the cache.
- **Hotfix**: `DEFAULT_REPLAY_OPTIONS` was hardcoding `minEventGapMs=50`, which made the config-level hotfix ineffective (678 tokens × 50ms = 33.9s). Changed to reference the config constant (5ms).
- **Cache miss fix**: `getExampleCache` was over-strict on key dimensions — the frontend `fetch` only sends `{content, source, title}`, so `model/providerType/outputLocale/preset` are inferred server-side from cookie/prefs/env. If user prefs differ from fixture-recording prefs (e.g. `LLM_MODEL=deepseek-chat` or `outputLocale=zh-CN`), cache misses → live path → 30-90s timeout. Relaxed to return fixture on `contentHash` match, ignoring other dimensions for example requests.

#### A1 boundary defense
- **S2 + arXiv external search**: added `AbortSignal.timeout(8000)` to prevent pipeline stall.
- **arXiv API**: `http://` → `https://` protocol upgrade.
- **Export step**: deduplicate execution at `executePlan` entry.

#### v2.3.2 security hardening preserved
`maxDuration=60`, 58s `Promise.race`, H4 stack trace sanitization, `allAgentsFailed` diagnostics, and the C1 cookie refactor are all retained; the cache branch is purely additive on top.

#### Output Language fix
- **Problem**: `Output Language` selection had no effect — input Chinese always output Chinese.
- **Root cause**: [coordinator.ts](core/orchestration/coordinator.ts) hardcoded `targetLocale = sourceLocale`, and the route didn't pass `outputLocale` to `coordinate()`.
- **Fix**: Added `outputLocale` field to `CoordinatorInput`; the route now passes the resolved `outputLocale` (with `'auto'` already resolved to the detected locale). Selecting Output=English + inputting Chinese now produces an English Knowledge Card.

#### Application Language — Japanese removed
- **Problem**: `ja-JP` in Application Language had no real function (no translation pack — it fell back to en-US).
- **Fix**: Removed `ja-JP` from `AppLocale`; the dropdown now shows only `auto / zh-CN / en-US`. The browser-language resolver also falls back to en-US for Japanese browsers. Output Language still supports `ja-JP` (passed through to the LLM, unaffected).

### v2.3.2 Highlights

#### Security hardening — Critical
- **API key removed from cookie**: apiKey now stored in localStorage (not written to cookie); cookie only stores non-sensitive fields (type / baseURL / model) + HttpOnly; server-side apiKey falls back to `OPENAI_API_KEY` env.

#### Security hardening — High
- **Tool whitelist**: `/api/tools/call` publicly exposes only `web_search` + `arxiv`; `filesystem` / `memory` require `x-internal-key` header.
- **SSRF guard**: `/api/settings/test-provider` validates baseURL, rejects localhost / internal IPs / cloud metadata endpoints.
- **Rate limit**: fetch-url (15/min) + tools/call (20/min).
- **Production stack trace sanitization**: `NODE_ENV === 'production'` no longer returns `debug.stack`.
- **pluginId format validation**: `^[a-z0-9-]{1,64}$`.

#### Cleanup — Medium + Low
- `redirect: 'error'` → `'follow'` (supports legitimate 301/302).
- JSON truncation repair now adds a `wasRepaired` marker + `json-repaired` tag (lets the UI surface "data may be incomplete").
- Removed dead code `computeWalletNonce` (D22 deprecated leftover).
- Removed unused `import OpenAI` (refactor leftover).

### v2.3.1 Highlights

#### Security hardening (P0 + P1)
- **onchain mode safe fallback**: `resolveOnchainMode()` force-falls real → mock, avoiding crashes from unimplemented interfaces.
- **CORS whitelist**: `lib/cors.ts` three-layer policy (same-origin / localhost / `*.vercel.app` / env variable).
- **PDF magic bytes validation**: checks `%PDF-` file header, prevents .exe/.html rename uploads.
- **Rate limit**: in-memory Map counter (KC 10/min, PDF 5/10min, Batch 3/10min).
- **onchain export double confirmation**: `window.confirm` to prevent accidental onchain broadcast.
- **Planner exponential backoff**: LLM call failure 1s → 2s retry, max 3 attempts.

#### Vercel deployment fixes
- Read-only fs redirected to `/tmp/` (4 persistence modules).
- JSON parse diagnostics enhanced (HTTP 400 + full request body snippet).

#### Plugin marketplace polish
- Replaced duplicate community plugins: obsidian-publish → anki-cards; ipfs-pin → github-gist.
- Honored the mock-install promise: installed community plugins now appear in the main panel (CommunityPluginCard).
- Built-in plugins show "✓ Installed" and are non-clickable.
- Install button copy explicitly states mock mode.

### v2.3.0 Highlights

#### Plugin System v2 (D31-D33)
- `PluginManifest` schema — market entry with id / name / version / author / icon / tags / category / configSchema / permissions / installCount / rating
- **Plugin Marketplace** — 3 built-in (json-download / markdown-download / onchain-export) + 4 community mock (notion-publish / anki-cards / arxiv-source / github-gist)
- **Batch Execution Queue** — BatchToolbar with select all / clear / run all + SVG progress bar (serial execution + success/fail summary)
- **Lifecycle hooks** — `onEnable` / `onDisable` / `onUninstall` (with permissions declaration)
- **PluginRegistry** — singleton with `triggerLifecycle()` + `listByCategory()`

#### Full i18n (D36-D40)
**4-layer language separation architecture**:

| Layer | Name | Purpose | Options |
|---|---|---|---|
| 1 | Application Language | UI text / Help / Tooltip / Preset label | `auto / zh-CN / en-US` |
| 2 | Output Language | KC output language | `auto` (follow source) or explicit `zh-CN / en-US / ja-JP / ko-KR / fr-FR / de-DE / es-ES` |
| 3 | Auto Translate | Explain / Chat / Compare reply language | `On / Off` (follows Application Language when On) |
| 4 | Prompt Language | LLM internal prompt language | locked to `en-US` (best performance) |

**Tech stack**: self-built zero-dependency `t(key, params, locale)` system (< 1KB), 6 namespaces (`home / agent / common / settings / preset / export`), no heavy i18next / react-intl dependency.

**LanguageDetectBanner**: detects input language via Unicode range statistics, suggests switching Output Language when source ≠ UI language, one-click apply.

#### UI Polish (D34-D35)
- **ScrollToTop** — fixed floating button with SVG `stroke-dashoffset` progress ring (indigo→cyan gradient), draggable to any position
- **Auto-scroll on KC completion** — smooth `scrollIntoView` to result section (demo-friendly)
- **LiveThoughts (D27)** — SSE `agent_token` event streams Planner / Reflection / Replan tokens in real-time (left-bottom floating panel, ref-accumulated + 60ms throttle)
- **Form submit** — Enter to submit, Shift+Enter for newline (chat-app pattern)

---

## Architecture

### Multi-Agent Pipeline

```
User Input
   ↓
[Planner] ── decides which agents to invoke based on input_type
   ↓
[Reader] + [Analyzer] + [Terminology]   ← parallel
   ↓
[KnowledgeBuilder] ── assembles Knowledge Card
   ↓
[Recommendation] ── finds follow-up papers
   ↓
[Export] ── Markdown / Obsidian / JSON / Onchain
   ↓
[Reflection] ── reviews result; if !satisfied → [Replan] → re-execute missing pieces
   ↓
[Tool Calls] ── MCP tools (memory / filesystem / arxiv / web_search)
```

### Two-Phase Language Architecture (Locale-Aware)

Each agent runs in two phases to preserve information across languages:

| Phase | What happens | Why |
|---|---|---|
| **1. Understanding** | Reason in the SOURCE language | Translation during reasoning loses details |
| **2. Rendering** | Output in the TARGET locale | User-facing fields localized |

Supported source locales: `zh-CN` `en-US` `ja-JP` `ko-KR` `fr-FR` `de-DE` `es-ES` `other`

Programmatic locale detection (Unicode character distribution) — no LLM call wasted on language guessing. Technical terms (model names, dataset names, algorithm names) are NEVER translated across languages.

### Three-Layer Prompt System (v2.1+)

```
System Prompt 🔒 (locked)        — base agent behavior
   +
Preset Persona 🎭 (5 roles)      — academic / beginner / developer / researcher / product_manager
   +
Project Custom ➕ (user edit)    — optional user override (max 8000 chars)
   =
Final Prompt                     — sent to LLM
```

### Plugin System v2 (D31-D33)

```
PluginPanel (UI with Marketplace + BatchToolbar)
   ↓
PluginRegistry (singleton, lifecycle hooks, listByCategory)
   ↓
Plugins (implement ExportPlugin interface + PluginManifest + PluginPermissions)
   ↓
OnchainServices (6 swappable interfaces: TxSigner / IpfsUploader / NonceProvider / GasEstimator / ContractCaller / WalletConnector)
```

Hot-pluggable + idempotent + never throws. Plugin states persisted to localStorage; manifests fetched from `/api/plugins/marketplace` (server-side manifest data source).

---

## API

### Primary endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/research/multi-agent-stream` | **SSE streaming** — primary endpoint, real-time progress + `agent_token` live thoughts + final KC |
| `POST` | `/api/research/multi-agent` | Non-streaming variant |
| `POST` | `/api/research/knowledge-card` | Legacy single-agent endpoint |
| `POST` | `/api/research/upload-pdf` | PDF upload + text extraction |
| `POST` | `/api/research/fetch-url` | Fetch URL content (SSRF-protected) |
| `POST` | `/api/research/batch` | Batch URL processing |
| `POST` | `/api/research/compare-papers` | 6-dimension paper comparison (Auto Translate directive) |
| `POST` | `/api/research/chat-kc` | Chat with a Knowledge Card (Auto Translate directive) |
| `POST` | `/api/research/explain-kc` | 4-audience explanation (Auto Translate directive) |
| `POST` | `/api/research/smart-suggestion` | D30 — LLM-driven similar KC recommendation |
| `POST` | `/api/research/playground` | Prompt playground executor |
| `POST` | `/api/settings/test-provider` | Test LLM provider connection |
| `GET`  | `/api/plugins/marketplace` | D32 — list all plugin manifests |
| `POST` | `/api/plugins/install` | D32 — simulate plugin install |
| `GET`  | `/api/history/kc` | D28 — KC history (paginated) |
| `GET`  | `/api/history/cost` | D29 — Cost history (paginated) |
| `GET`  | `/api/health` | Service health (agents + tools) |
| `GET`  | `/api/tools/list` · `POST` `/api/tools/call` | MCP tool registry |

### SSE contract (`/api/research/multi-agent-stream`)

**Request:**
```json
{
  "content": "Full paper text or abstract (min 200 chars)",
  "title": "Optional paper title",
  "source": "Optional source URL or filename"
}
```

**Response**: SSE stream with `ping` (connection flush) + `stage` (progress) + `agent_token` (D27 live thoughts) + `result` (final payload) events:

```json
{
  "knowledge_card": {
    "title": "...",
    "authors": ["..."],
    "field": "NLP",
    "takeaway": "...",
    "terms": [{ "term": "Self-attention", "importance": 5, "prerequisite": ["Embedding"] }],
    "recommendations": [{ "intent": "improve", "title": "...", "reason": "..." }]
  },
  "exports": { "markdown": "...", "obsidian": "...", "json": "..." },
  "iterations": [...],   // reflection loop trace
  "metadata": {
    "total_duration_ms": 22000,
    "total_tokens": 13019,
    "total_cost_usd": 0.0022,
    "per_agent_usage": [...]
  }
}
```

---

## Tech Stack

- **Framework**: Next.js 14.2.5 (App Router)
- **Language**: TypeScript 5 (strict mode, 0 errors)
- **LLM SDK**: OpenAI 4.52.0 (compatible with 9 providers via `OpenAICompatProvider`)
- **PDF Parsing**: pdf-parse 2.4.5
- **i18n**: Self-built zero-dependency `t(key, params, locale)` (< 1KB), 6 namespaces
- **Test Runner**: Native node fetch + SSE parsing (zero heavy deps, no jest/vitest)
- **Visualization**: Custom Knowledge Graph + Agent Timeline + Cost Dashboard + LiveThoughts + ScrollToTop
- **Deploy**: Vercel (`researchkit-mu.vercel.app`)
- **Onchain OS**: ASP registered on X Layer (ASP ID #6853)

---

## Development

### Prerequisites

- Node.js 18+
- A DeepSeek API key (or any OpenAI-compatible endpoint — OpenAI / OpenRouter / Groq / SiliconFlow / Volcano / DashScope / Hunyuan / Custom)

### Install & Run

```bash
npm install
npm run dev
```

Open http://localhost:3000

### Environment Variables

Copy `.env.local.example` to `.env.local` and fill in:

```bash
OPENAI_API_KEY=your-deepseek-api-key
OPENAI_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
```

> Tip: you can also configure the LLM provider at runtime via the Settings UI (`/settings` → Provider tab) — no restart needed.

### Test

```bash
npm run test:regression   # 10-paper regression suite × 2 locales = 20 runs
```

Report is written to `scripts/reports/regression-{timestamp}.{json,md}`. Set `RESEARCHKIT_TARGET_LOCALES=zh-CN` or `en-US` to debug a single locale.

### Start script (Windows)

```bash
start.bat
```

Includes dependency validation, port cleanup, and auto-open browser.

---

## Project Structure

```
researchkit/
├── app/
│   ├── page.tsx                      # Main UI (text/url/pdf/batch, progress, KC, ScrollToTop, LiveThoughts)
│   ├── layout.tsx                   # I18nProvider + Locale cookie handling
│   ├── settings/page.tsx             # Settings UI (5 tabs, full i18n)
│   ├── playground/page.tsx           # Prompt playground UI
│   └── api/
│       ├── health/route.ts
│       ├── research/
│       │   ├── multi-agent-stream/   # SSE endpoint (primary) + agent_token events
│       │   ├── multi-agent/          # non-streaming variant
│       │   ├── knowledge-card/       # legacy single-agent
│       │   ├── upload-pdf/
│       │   ├── fetch-url/
│       │   ├── batch/
│       │   ├── compare-papers/       # D8 — 6-dimension comparison (+ Auto Translate)
│       │   ├── chat-kc/              # D10 — chat with KC (+ Auto Translate)
│       │   ├── explain-kc/           # D11 — 4-audience explanation (+ Auto Translate)
│       │   ├── smart-suggestion/     # D30 — LLM-driven recommendation
│       │   └── playground/          # D14 — prompt playground
│       ├── plugins/
│       │   ├── marketplace/          # D32 — list manifests
│       │   └── install/              # D32 — simulate install
│       ├── history/
│       │   ├── kc/                   # D28 — KC history API
│       │   └── cost/                 # D29 — Cost history API
│       ├── settings/test-provider/
│       └── tools/
│           ├── list/
│           └── call/
├── components/
│   ├── KnowledgeGraph.tsx           # Custom DAG renderer (two-level expandable)
│   ├── AgentTimeline.tsx            # Agent execution timeline + PipelineChip
│   ├── ChatWithKC.tsx               # D10 — chat UI (i18n)
│   ├── CompareTab.tsx               # D8 — paper comparison UI (i18n)
│   ├── ExplainKC.tsx                # D11 — explanation UI (i18n)
│   ├── PluginPanel.tsx              # D12 + D31-33 — plugin manager + marketplace + batch queue
│   ├── SmartSuggestionBanner.tsx    # D9 + D30 — similarity banner (LLM v2)
│   ├── LiveThoughts.tsx             # D27 — SSE token streaming panel (left-bottom)
│   ├── ScrollToTop.tsx              # D34 — draggable floating button + progress ring
│   ├── LanguageDetectBanner.tsx     # D39 — input language detection + suggestion
│   ├── I18nProvider.tsx             # D36 — useI18n() hook + locale cookie
│   ├── ui/
│   │   ├── Card.tsx                  # KC field card with staggered entry animation
│   │   └── Chip.tsx
│   └── settings/
│       ├── SettingsContainer.tsx
│       └── tabs/                     # 5 settings tabs (full i18n)
├── core/
│   ├── agents/                       # 6 agent modules (modular)
│   │   ├── reader/
│   │   ├── analyzer/
│   │   ├── terminology/
│   │   ├── knowledge-builder/
│   │   ├── recommendation/
│   │   └── export/
│   ├── orchestration/
│   │   ├── coordinator.ts            # Plan-driven execution + Reflection loop
│   │   ├── executor.ts                # Step execution engine
│   │   ├── planner.ts                # Planner integration
│   │   └── workflow.ts               # Reflection + Replan loop (MAX_ITERATIONS=2)
│   ├── llm/
│   │   ├── provider.ts               # LLMProvider interface + ProviderFactory
│   │   └── providers/openai-compat.ts # 9-provider OpenAI-compatible client
│   ├── prompt/
│   │   └── PromptBuilder.ts          # System + Preset + Project three-layer
│   └── plugins/
│       ├── registry.ts               # Plugin registry singleton (lifecycle + listByCategory)
│       ├── onchain-export.ts         # Dual-mode onchain plugin (D22)
│       └── sample-plugins.ts
├── lib/
│   ├── i18n.ts                       # D36 — t() function
│   ├── locale.ts                     # Two-phase language architecture
│   ├── locale-types.ts               # AppLocale / ResolvedLocale
│   ├── detect-language.ts            # D39 — input language detection
│   ├── smart-suggestion.ts           # D9 — heuristic similarity scoring (fallback)
│   ├── server-smart-suggestion.ts    # D30 — LLM-driven recommendation
│   ├── server-user-preferences.ts   # D39 — server-side prefs + Auto Translate directive
│   ├── user-preferences.ts           # Client preferences
│   ├── plugin-marketplace.ts         # D32 — client marketplace API
│   ├── plugin-states.ts              # Plugin state persistence
│   ├── onchain-ledger.ts             # D13 — localStorage onchain ledger
│   ├── onchain-utils.ts              # SHA-256 via Web Crypto API
│   ├── onchain-modes.ts              # D22 — resolveOnchainMode() mock/real switch
│   ├── onchain-mock.ts               # D22 — mock implementations
│   ├── onchain-real.ts               # D22 — real SDK stubs (OKX Agentic Wallet + Pinata + viem)
│   ├── usage-collector.ts           # D6 — per-agent token collection
│   ├── cost-history.ts               # localStorage FIFO 50 entries
│   ├── ui-labels.ts                  # D38 — getKcFieldLabels(appLocale)
│   ├── ui-styles.ts                  # Shared button / input / tab styles
│   ├── persistence/                  # Server-side persistence layer
│   │   ├── kc-history-server.ts
│   │   ├── cost-history-server.ts
│   │   └── plugin-marketplace-server.ts
│   └── ... (legacy compat re-exports)
├── types/                            # TypeScript type definitions
│   ├── agent.ts
│   ├── knowledge.ts
│   ├── workflow.ts
│   ├── compare.ts
│   ├── export.ts
│   ├── plugin.ts                    # D31 — + PluginPermissions + lifecycle + category
│   ├── plugin-manifest.ts           # D32 — marketplace manifest schema
│   ├── onchain.ts                   # D22 — 6 swappable interfaces
│   └── index.ts
├── locales/                          # D36-D40 — i18n message catalogs
│   ├── zh-CN/
│   │   ├── home.json
│   │   ├── agent.json
│   │   ├── common.json
│   │   ├── settings.json
│   │   ├── preset.json
│   │   └── export.json
│   └── en-US/
│       ├── home.json
│       ├── agent.json
│       ├── common.json
│       ├── settings.json
│       ├── preset.json
│       └── export.json
├── prompts/                          # Agent prompt builders (text locked by hard constraint)
│   ├── planner.ts                    # Planner + Reflection + Replan prompts
│   ├── reader.ts
│   ├── analyzer.ts
│   ├── terminology.ts
│   ├── recommendation.ts
│   └── smart-suggestion.ts           # D30 — LLM v2 prompt
├── fixtures/papers/                   # D17 — 10 regression fixtures
│   ├── en-001-attention-is-all-you-need.json
│   ├── en-002-bert.json
│   ├── en-003-ddpm.json
│   ├── en-004-dqn.json
│   ├── en-005-alphafold.json
│   ├── zh-001-ernie.json
│   ├── zh-002-transe.json
│   ├── zh-003-wide-deep.json
│   ├── zh-004-stylegan.json
│   └── zh-005-quantum-nn.json
├── scripts/
│   ├── regression-test.ts             # D17 + D40 — 10-paper × 2-locale regression runner
│   ├── analyze-tokens.ts             # D19 — per-agent token distribution
│   ├── commit-msgs/                  # Historical commit/PR message archive
│   └── reports/                       # Generated regression reports
├── docs/
│   ├── CHANGELOG.md
│   ├── roadmap.md                    # Long-term vision
│   ├── archive/                      # Completed roadmaps (v2 / v2.1 / v2.2.5 / v2.3 / v2.3-i18n)
│   ├── demo-script.md                # 90s demo script (zh)
│   ├── demo-script-en.md             # 90s demo script (en, for hackathon submission)
│   ├── demo-checklist.md             # 9-section recording checklist
│   └── BRANCHING.md                  # Git workflow (main / develop / feature/*)
├── releases/                         # Release artifacts
│   ├── v1.0-release-notes.md
│   ├── v2.0-release-notes.md
│   ├── v2.1-release-notes.md
│   ├── v2.2-release-notes.md
│   ├── v2.2.5-release-notes.md
│   ├── v2.2.6-release-notes.md
│   ├── v2.3.0-release-notes.md
│   ├── v2.3.1-release-notes.md
│   ├── screenshots/                   # Versioned PNG screenshots
│   └── demo-video/                    # ≤ 90s demo MP4 files
├── .env.local.example
├── start.bat                          # Windows launcher
├── package.json                       # v2.3.3
└── README.md
```

---

## OKX.AI ASP Details

| Field | Value |
|---|---|
| ASP ID | #6853 |
| ASP Name | ResearchKit OS |
| Service type | A2MCP (free, 0 USDT) |
| Endpoint | `https://researchkit-mu.vercel.app/api/research/multi-agent-stream` |
| Network | X Layer |
| Version | v2.3.3 (example cache + demo replay engine, 2026-07-23) |
| Onchain Mode | `mock (demo)` — 6 swappable interfaces stubbed, real SDK in D23/D24 roadmap |
| Onchain OS TX | _mock_ (deterministic hash derived from KC content + wallet, never broadcast) |

---

## Versioning Policy

| Version bump | When |
|---|---|
| **Major (x.0)** | Architecture-level changes (new agent roles, new protocol) |
| **Minor (1.x)** | New features in existing architecture (new export, new input mode, new subsystem) |
| **Patch (1.0.x)** | Bug fixes, prompt tuning, UI polish, quality releases |

**v2.3.3** is a Patch release — performance optimization for the hackathon-critical "Load Example" button. Adds a three-layer example cache (in-process Map + repo fixture + runtime fs) + a demo replay engine that replays recorded stage/token events on a scaled timeline, dropping "Load Example" wall time from 30-90s to ~10-15s (4-5x speedup) with zero output quality loss. Includes a hotfix for `DEFAULT_REPLAY_OPTIONS` hardcoding `minEventGapMs=50` (config hotfix was not propagating), a cache-miss fix that relaxes over-strict key dimensions for example requests, an `Output Language` fix that makes the selection actually take effect, and removal of the non-functional `ja-JP` option from Application Language. All v2.3.2 security hardening preserved. See [release notes](https://github.com/yuuumc/researchkit/releases/tag/v2.3.3) for full details.

**v2.3.2** is a Patch release — security hardening based on `ResearchKit-2.3.1-审查报告.md`. Day 1: C1 Critical (API key moved out of cookie) + H1-H5 High (tool whitelist, SSRF guard, rate limit, stack trace sanitization, pluginId validation). Day 2: M2/M3/L1/L2/L3 cleanup (redirect policy, JSON truncation marker, dead code removal). See [release notes](./releases/v2.3.2-release-notes.md) for full details.

**v2.3.1** is a Patch release — security hardening (API key never shown in plain, danger styling, double confirmation), Vercel deployment fixes (58s timeout guard, MAX_ITERATIONS=0 on Vercel), and plugin marketplace improvements (deduped community plugins, built-in shown as installed). See [release notes](./releases/v2.3.1-release-notes.md) for full details.

**v2.3.0** is a Minor release — adds Plugin System v2 (marketplace + batch execution), full i18n (4-layer language separation), and UI polish (draggable ScrollToTop, LiveThoughts streaming, Enter-to-submit). See [release notes](./releases/v2.3.0-release-notes.md) for the 7-phase / 14-PR breakdown.

---

## License

MIT

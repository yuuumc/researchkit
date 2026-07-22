# ResearchKit OS — AI Research Operating System

> Multi-agent research pipeline that turns any paper into a structured knowledge card —
> chat with it, compare it, explain it, anchor it onchain.
> Built for **OKX AI Genesis Hackathon** — ASP #6853 on [OKX.AI](https://www.okx.ai/agents/6853).

![version](https://img.shields.io/badge/version-v2.2.5-blue)
![status](https://img.shields.io/badge/status-live-brightgreen)
![tests](https://img.shields.io/badge/regression-10%2F10-brightgreen)
![license](https://img.shields.io/badge/license-MIT-green)

🌐 **Live demo**: https://researchkit-mu.vercel.app
📦 **Latest release**: [v2.2.5 Quality Release](https://github.com/yuuumc/researchkit/releases/tag/v2.2.5)

📖 **Docs**: [CHANGELOG](./docs/CHANGELOG.md) · [v2.2.5 Roadmap](./docs/v2.2.5-roadmap.md) · [Branching](./docs/BRANCHING.md)

---

## Quick Stats (v2.2.5)

| Metric | Value |
|---|---|
| Regression test pass rate | **100%** (10/10 papers, 5 langs × 5 domains) |
| Avg tokens / Knowledge Card | 13,019 |
| Avg cost / Knowledge Card | $0.0022 |
| SSE first-byte latency | < 100ms |
| Production build (First Load JS) | 126 kB |
| LLM providers supported | 9 (DeepSeek / OpenAI / OpenRouter / Groq / SiliconFlow / Volcano / DashScope / Hunyuan / Custom) |
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
- 📤 **Export** — Markdown / Obsidian / JSON

### Interactive features (v2.2+)

- 💬 **Chat with Knowledge Card** — ask follow-up questions, KC context injected (temperature 0.4)
- 📊 **Compare Papers** — 6-dimension comparison (field / methodology / key_contributions / strengths / limitations / complexity) + dual-color radar chart
- 🎓 **Explain Agent** — 4 audience-driven explanations (high_school / software_engineer / researcher / product_manager)
- ⚡ **Smart Suggestion** — same-session heuristic similarity scoring (zero LLM calls, zero latency)
- 🔌 **Plugin System** — three-layer architecture (UI → Registry → Plugins), hot-pluggable + idempotent
- ⛓️ **Onchain Export (Demo Mode)** — SHA-256 content hash + localStorage ledger (X Layer mainnet broadcast in v2.3)
- 🧪 **Prompt Playground** — 4 presets (Summarizer / JSON Extractor / Creative Writer / Translator) + temperature / maxTokens / responseFormat controls

### Quality (v2.2.5)

- ✅ **10-paper regression suite** — 5 Chinese + 5 English, covering NLP / CV / RL / Bio / Physics
- ✅ **Token optimization** — 51% token reduction vs v2.2 baseline
- ✅ **Mobile responsive** — full layout adapts to 375x812 viewport
- ✅ **KC success celebration** — scale + blur entry animation + top sweep ribbon

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
[Export] ── Markdown / Obsidian / JSON
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

Supported locales: `zh-CN` `en-US` `ja-JP` `ko-KR` `fr-FR` `de-DE` `es-ES` `other`

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

### Plugin System (v2.2+)

```
PluginPanel (UI)  →  PluginRegistry (singleton)  →  Plugins (implement ExportPlugin interface)
```

Hot-pluggable + idempotent + never throws. Ships with `jsonDownloadPlugin` and `markdownDownloadPlugin` as samples; `onchain-export.ts` provides the Demo Mode onchain plugin.

---

## API

### Primary endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/research/multi-agent-stream` | **SSE streaming** — primary endpoint, real-time progress + final KC |
| `POST` | `/api/research/multi-agent` | Non-streaming variant |
| `POST` | `/api/research/knowledge-card` | Legacy single-agent endpoint |
| `POST` | `/api/research/upload-pdf` | PDF upload + text extraction |
| `POST` | `/api/research/fetch-url` | Fetch URL content (SSRF-protected) |
| `POST` | `/api/research/batch` | Batch URL processing |
| `POST` | `/api/research/compare-papers` | 6-dimension paper comparison |
| `POST` | `/api/research/chat-kc` | Chat with a Knowledge Card |
| `POST` | `/api/research/explain-kc` | 4-audience explanation |
| `POST` | `/api/research/playground` | Prompt playground executor |
| `POST` | `/api/settings/test-provider` | Test LLM provider connection |
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

**Response**: SSE stream with `ping` (connection flush) + `stage` (progress) + `result` (final payload) events:

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
- **Test Runner**: Native node fetch + SSE parsing (zero heavy deps, no jest/vitest)
- **Visualization**: Custom Knowledge Graph + Agent Timeline + Cost Dashboard
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
npm run test:regression   # 10-paper regression suite (SSE + assertions)
```

Report is written to `scripts/reports/regression-{timestamp}.{json,md}`.

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
│   ├── page.tsx                      # Main UI (text/url/pdf/batch modes, progress, KC, mobile responsive)
│   ├── layout.tsx
│   ├── settings/page.tsx             # Settings UI (5 tabs: General/Provider/Prompt/Cost/About)
│   ├── playground/page.tsx           # Prompt playground UI
│   └── api/
│       ├── health/route.ts
│       ├── research/
│       │   ├── multi-agent-stream/   # SSE endpoint (primary)
│       │   ├── multi-agent/          # non-streaming variant
│       │   ├── knowledge-card/       # legacy single-agent
│       │   ├── upload-pdf/
│       │   ├── fetch-url/
│       │   ├── batch/
│       │   ├── compare-papers/       # D8 — 6-dimension comparison
│       │   ├── chat-kc/              # D10 — chat with KC
│       │   ├── explain-kc/           # D11 — 4-audience explanation
│       │   └── playground/           # D14 — prompt playground
│       ├── settings/test-provider/   # Provider connection test
│       └── tools/
│           ├── list/
│           └── call/
├── components/
│   ├── KnowledgeGraph.tsx           # Custom DAG renderer (two-level expandable)
│   ├── AgentTimeline.tsx            # Agent execution timeline + token bar
│   ├── ChatWithKC.tsx               # D10 — chat UI
│   ├── CompareTab.tsx               # D8 — paper comparison UI
│   ├── ExplainKC.tsx                # D11 — explanation UI
│   ├── PluginPanel.tsx              # D12 — plugin manager UI
│   ├── SmartSuggestionBanner.tsx    # D9 — same-session similarity banner
│   ├── ui/
│   │   ├── Card.tsx                  # KC field card with staggered entry animation
│   │   └── Chip.tsx
│   └── settings/
│       ├── SettingsContainer.tsx
│       └── tabs/                     # 5 settings tabs
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
│       ├── registry.ts               # Plugin registry singleton
│       ├── onchain-export.ts         # Demo Mode onchain plugin
│       └── sample-plugins.ts
├── config/
│   └── presets.ts                    # 5 role presets (academic/beginner/developer/researcher/PM)
├── prompts/                          # Agent prompt builders (text locked by hard constraint)
│   ├── planner.ts                    # Planner + Reflection + Replan prompts
│   ├── reader.ts
│   ├── analyzer.ts
│   ├── terminology.ts
│   └── recommendation.ts
├── types/                            # TypeScript type definitions
│   ├── agent.ts
│   ├── knowledge.ts
│   ├── workflow.ts
│   ├── compare.ts
│   ├── export.ts
│   ├── plugin.ts
│   └── index.ts
├── lib/
│   ├── locale.ts                     # Two-phase language architecture
│   ├── smart-suggestion.ts           # D9 — heuristic similarity scoring
│   ├── usage-collector.ts            # D6 — per-agent token collection
│   ├── cost-history.ts               # localStorage FIFO 50 entries
│   ├── onchain-ledger.ts             # D13 — localStorage onchain ledger
│   ├── onchain-utils.ts              # SHA-256 via Web Crypto API
│   ├── server-provider.ts            # Server-side provider config
│   ├── user-preferences.ts           # Client preferences (preset + locale)
│   └── ... (legacy compat re-exports)
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
│   ├── regression-test.ts             # D17 — 10-paper regression runner
│   ├── analyze-tokens.ts             # D19 — per-agent token distribution
│   └── reports/                       # Generated regression reports
├── docs/
│   ├── CHANGELOG.md                   # v1.0 → v2.0 → v2.1 → v2.2 → v2.2.5
│   ├── roadmap.md                    # Long-term vision
│   ├── v2.1-roadmap.md                # v2.1 sprint plan
│   ├── v2.2.5-roadmap.md              # v2.2.5 5-day quality sprint
│   ├── demo-script.md                 # 90s demo script (OKX requirement)
│   ├── demo-checklist.md              # 9-section recording checklist
│   └── BRANCHING.md                   # Git workflow (main / develop / feature/*)
├── releases/                         # Release artifacts
│   ├── v1.0-release-notes.md
│   ├── v2.0-release-notes.md
│   ├── v2.1-release-notes.md
│   ├── v2.2-release-notes.md
│   ├── v2.2.5-release-notes.md
│   ├── screenshots/                   # Versioned PNG screenshots
│   └── demo-video/                    # ≤ 90s demo MP4 files
├── .env.local.example
├── start.bat                          # Windows launcher
├── package.json                       # v2.2.5
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
| Version | v2.2.5 (Quality Release, 2026-07-21) |
| Onchain OS TX | `0x86b24fdac27bc16e8ea70f0207bedeba4bdf3a399e529074e0cc720e1edec55d` |

---

## Versioning Policy

| Version bump | When |
|---|---|
| **Major (x.0)** | Architecture-level changes (new agent roles, new protocol) |
| **Minor (1.x)** | New features in existing architecture (new export, new input mode) |
| **Patch (1.0.x)** | Bug fixes, prompt tuning, UI polish, quality releases |

**v2.2.5** is a quality patch release — no architecture or feature additions over v2.2, only test coverage, performance, mobile responsive, and KC success animation improvements.

---

## License

MIT

# ResearchKit OS — AI Research Operating System

> Multi-agent research pipeline that turns any paper into a structured knowledge card.
> Built for **OKX AI Genesis Hackathon** — ASP #6853 on [OKX.AI](https://www.okx.ai/agents/6853).

🌐 **Live demo**: https://researchkit-mu.vercel.app

---

## What it does

Paste any paper, document, or URL → a team of 6 AI agents reads, analyzes, and synthesizes it into a structured **Knowledge Card** with:

- 🎯 **Takeaway** — the one-sentence core conclusion you'll remember in a year
- 💭 **Why It Matters** — significance, novelty, impact
- ✨ **What Surprised Me** — the most counterintuitive finding
- 👥 **Who Should Read** — specific reader profiles (not "researchers" or "students")
- 🔤 **Terminology DAG** — knowledge graph where each term links to its prerequisites
- 📚 **4-intent Recommendations** — follow-up papers across `improve` / `challenge` / `apply` / `survey`
- 📤 **Export** — Markdown / Obsidian / JSON

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

---

## API

### `POST /api/research/multi-agent-stream`  (SSE)

Server-Sent Events endpoint that streams progress + final result in real time.

**Request:**
```json
{
  "content": "Full paper text or abstract (min 200 chars)",
  "title": "Optional paper title",
  "source": "Optional source URL or filename"
}
```

**Response**: SSE stream with `stage` events for progress + `result` event with full payload:

```json
{
  "plan": { "rationale": "...", "steps": [...], "input_type": "paper" },
  "knowledgeCard": {
    "title": "...",
    "authors": ["..."],
    "field": "NLP",
    "takeaway": "...",
    "whyItMatters": "...",
    "whatSurprised": "...",
    "whoShouldRead": ["..."],
    "terms": [{ "term": "Self-attention", "importance": 5, "prerequisite": ["Embedding"] }],
    "recommendations": [{ "intent": "improve", "title": "...", "reason": "..." }]
  },
  "exports": { "markdown": "...", "obsidian": "...", "json": "..." },
  "iterations": [...],  // reflection loop trace
  "pipeline": [...]
}
```

### Other endpoints

- `POST /api/research/multi-agent` — non-streaming variant
- `POST /api/research/knowledge-card` — legacy single-agent endpoint
- `POST /api/research/upload-pdf` — PDF upload + text extraction
- `POST /api/research/fetch-url` — fetch URL content (with SSRF protection)
- `POST /api/research/batch` — batch URL processing
- `GET /api/tools/list` / `POST /api/tools/call` — MCP tool registry

---

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **LLM**: DeepSeek (`deepseek-v4-flash` or any OpenAI-compatible API)
- **Language**: TypeScript (strict)
- **Agents**: Custom multi-agent framework with MCP-style tool registry
- **Visualization**: Mermaid (knowledge graph), custom progress UI
- **Deploy**: Vercel
- **Onchain OS**: ASP registered on X Layer (ASP ID #6853)

---

## Development

### Prerequisites

- Node.js 18+
- DeepSeek API key (or any OpenAI-compatible endpoint)

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
LLM_MODEL=deepseek-v4-flash
```

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
│   ├── page.tsx                      # Main UI (text/url/pdf/batch modes, progress, knowledge graph)
│   ├── layout.tsx
│   └── api/
│       └── research/
│           ├── multi-agent-stream/  # SSE endpoint (primary)
│           ├── multi-agent/         # non-streaming variant
│           ├── knowledge-card/     # legacy single-agent
│           ├── upload-pdf/
│           ├── fetch-url/
│           └── batch/
├── components/
│   └── KnowledgeGraph.tsx           # Mermaid DAG renderer
├── lib/
│   ├── locale.ts                    # Two-phase language architecture (NEW)
│   ├── coordinator.ts               # Plan-driven execution + Reflection loop
│   ├── planner.ts                   # Planner + Reflection + Replan
│   ├── mcp.ts                       # Agent message protocol
│   ├── parser.ts                    # Markdown / Obsidian / JSON export
│   ├── llm.ts                       # LLM client wrapper
│   ├── agents/
│   │   ├── reader.ts                # Value-judgment reader
│   │   ├── analyzer.ts              # Dynamic schema (Planner-decided fields)
│   │   ├── terminology.ts           # Term DAG with importance + prerequisite
│   │   ├── knowledge-builder.ts     # Card assembly + quality scoring
│   │   ├── recommendation.ts       # 4-intent recommendations
│   │   └── export.ts                # Multi-format export
│   └── tools/
│       ├── memory.ts                # MCP memory tool
│       ├── filesystem.ts            # MCP filesystem tool
│       ├── arxiv.ts                 # arxiv search
│       ├── web_search.ts            # web search
│       └── registry.ts              # Tool registry
└── public/
```

---

## OKX.AI ASP Details

| Field | Value |
|---|---|
| ASP ID | #6853 |
| Service name | Paper Analysis Service |
| Service type | A2MCP (free, 0 USDT) |
| Endpoint | `https://researchkit-mu.vercel.app/api/research/multi-agent-stream` |
| Network | X Layer |
| Onchain OS TX | `0x86b24fdac27bc16e8ea70f0207bedeba4bdf3a399e529074e0cc720e1edec55d` |

---

## License

MIT

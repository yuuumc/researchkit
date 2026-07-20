# Changelog

All notable changes to ResearchKit OS are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

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

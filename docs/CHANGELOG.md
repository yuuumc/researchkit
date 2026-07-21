# Changelog

All notable changes to ResearchKit OS are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [v2.2] — 2026-07-21 — Interactive Knowledge Card + Plugin System

### Added
- **D8 Compare Papers** — 6 维对比 API + UI（field / methodology / key_contributions / strengths / limitations / complexity）+ overallScore + recommendedOrder + 双色雷达图
- **D9 Memory v1（Smart Suggestion）** — 纯客户端启发式评分（7 信号加权：field/authors/key_terms/tags/year + cross-title-summary + light stem），阈值 ≥ 30 显示 amber banner，零 LLM 调用零延迟
- **D10 Chat with Knowledge Card** — 青色卡片 Chat 组件，注入完整 KC 上下文（temperature 0.4），消息气泡 + 三点跳动 loading + 自实现 MarkdownLite 渲染 + 空状态动态生成 4 个建议问题
- **D11 Explain Agent** — 4 受众驱动解释（high_school / software_engineer / researcher / product_manager），每种独立 focus + style，输出 6 区块结构化 JSON（summary / whyItMatters / coreConcept / actionable / questions[3] / tags）
- **D12 Plugin System 三层架构** — UI (PluginPanel) → Registry (singleton) → Plugins (ExportPlugin interface)，热插拔 + 幂等 + 不 throw，含 2 个示例插件（jsonDownloadPlugin + markdownDownloadPlugin）
- **D13 Onchain Export Plugin（Demo Mode）** — 真实 SHA-256（Web Crypto API）+ 确定性派生 mock tx hash + localStorage ledger（FIFO 50 条），明确标注 Demo Mode，版本号 `0.9.0-mvp`
- **D14 Prompt Playground** — 双栏布局（左 prompt 编辑 + 右结果展示）+ 4 个 preset（Summarizer / JSON Extractor / Creative Writer / Translator）+ 参数控制（temperature 0-2 / maxTokens 上限 2048 / responseFormat）
- **D15 Demo 视频脚本** — 5 个分镜总时长 85s ≤ 90s OKX 硬性要求，9 章节 checklist 含应急方案

### Changed
- `components/PluginPanel.tsx` +295 行（OnchainHistory + OnchainRecordItem + Demo Mode 警告条）
- `app/page.tsx` 多次扩展（添加 ChatWithKC / ExplainKC / PluginPanel 折叠卡片）
- `package.json` version → 2.2.0

### Fixed
- BigInt literals 在 ES2019 target 下不可用 — 改用 `Math.imul` + `>>> 0` 实现 32-bit hash
- Uint8Array → Blob SharedArrayBuffer 类型冲突 — 改用 `new TextEncoder().encode()` 统一转 Uint8Array

### Operational
- **8 个 PR**（#14-#21）覆盖 D8-D15，每个独立通过 tsc + SSE 冒烟测试
- tsc --noEmit：0 错误
- 全链路冒烟测试通过（Health / Home / Settings / Playground / Compare / Chat / Explain API 均 200）

### Known Limitations（v2.3 改进）
- Onchain Export 是 Demo Mode（真实 SHA-256 + mock tx hash，未实际广播到 X Layer mainnet）
- Smart Suggestion 仅同会话（跨会话记忆需要 server side 持久化）
- Plugin 配置全局共享（不能按文档/项目区分）
- Explain 仅 4 受众（自定义受众需要扩展）

---

## [v2.1] — 2026-07-21 — Model Provider Abstraction + Agent Studio

### Added
- **D1 LLMProvider Interface 抽象层** — `core/llm/provider.ts` 统一所有 LLM 调用，`ProviderFactory` 工厂模式，`MODEL_PRICING` 价格表 + `estimateTokenCost()` 成本估算
- **D2 OpenAICompatProvider** — 覆盖 9 家厂商（DeepSeek / OpenAI / OpenRouter / Groq / 硅基流动 / 火山 / 百炼 / 混元 / Custom），`healthCheck()` 测试连接，`lib/server-provider.ts` server side 配置读取
- **D3 Settings UI 分 Tab** — Provider / General / Prompt / About 4 Tab，`lib/user-config.ts` localStorage + cookie 双写
- **D4 PromptBuilder 三层架构** — System 🔒 + Preset 🎭 + Project ➕ + User ➕，`MAX_PROMPT_LENGTH = 8000` 超限自动丢弃
- **D5 Prompt Preset（5 角色）** — academic / beginner / developer / researcher / product_manager，`config/presets.ts` + Output Locale（auto / zh-CN / en-US / ja-JP / ko-KR / fr-FR / de-DE / es-ES）
- **D6 Cost & Token Dashboard** — `lib/usage-collector.ts` 自动记录每次 `provider.chat()`，`AgentTimeline.tsx` 抽出 + token 条，`CostTab.tsx` 三区块（4 Summary Cards + Per-Agent Breakdown + Recent Runs），`lib/cost-history.ts` localStorage FIFO 50 条
- **D7 冒烟测试 + v2.1 tag + Release** — 全量验证通过

### Operational
- 7 个 PR（#8-#13）+ D7 release
- OKX AI Genesis Hackathon 提交基线

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

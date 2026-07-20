# Roadmap

This document describes the planned evolution of ResearchKit OS.
For released changes, see [CHANGELOG.md](./CHANGELOG.md).

---

## North Star

Make ResearchKit OS the default research operating system for academics, students, and knowledge workers — turning any paper into actionable knowledge in under 30 seconds.

---

## Shipped (v1.0 / v1.1 / v2.0)

See [CHANGELOG.md](./CHANGELOG.md) for the full record. Highlights:

- ✅ Knowledge Card with 15+ structured fields
- ✅ Markdown / Obsidian / Knowledge Graph exports
- ✅ Mermaid mindmap with escape hardening
- ✅ Planner agent with LLM-driven dynamic planning
- ✅ Reflection + Replan self-correction loop
- ✅ 6-agent OS architecture (Planner / Reader / Analyzer / Terminology / KnowledgeBuilder / Recommendation)
- ✅ Adaptive prompting based on input type
- ✅ Locale-aware two-stage reasoning
- ✅ ASP #6853 listed on OKX.AI Marketplace

---

## Next: v2.1 — Real-User Polish (Aug 2026)

Goal: on-board first 100 real users from OKX.AI Marketplace.

### Planned
- **Critic agent** — independent quality reviewer (separate from Reflection)
- **Explainer agent** — generates plain-language TL;DR for non-experts
- **User accounts** — save knowledge cards across sessions (currently ephemeral)
- **History feed** — revisit past analyses
- **Citation graph** — link multiple papers into a graph view
- **Performance**: cache Planner output for identical inputs (10x speedup on repeat)

### Stretch
- Public sharing links (read-only knowledge cards)
- Embedded widget for LMS / Notion

---

## Next: v3.0 — Research Copilot (Q4 2026)

Goal: move from one-shot paper analysis to ongoing research assistant.

### Planned
- **Memory system** — long-term user context (field, expertise level, prior reads)
- **Workflow agent** — multi-step research tasks ("survey the last 6 months of NeurIPS")
- **Pro tier** — subscription for academic institutions
- **MCP server** — expose ResearchKit as a tool to other agents
- **Multi-modal input** — images / tables / code from PDFs
- **Critic v2** — cross-paper contradiction detection

### Stretch
- Federated learning on private paper collections
- Voice mode (read knowledge card aloud)
- Integration with Zotero / Notion / Obsidian Sync

---

## Long-term Vision (2027+)

- **ResearchKit Network** — agents publish knowledge cards to a decentralized graph (X Layer)
- **Peer-review agent** — auto-generate peer review reports
- **Grant-writing copilot** — synthesize literature reviews into proposals
- **Multilingual research** — analyze Chinese papers and render in English (and vice versa) at production quality

---

## Branching Strategy

See [BRANCHING.md](./BRANCHING.md) for the development workflow.

| Branch | Purpose |
|---|---|
| `main` | Always-demoable, always-competition-ready stable release |
| `develop` | Daily development and refactoring |
| `feature/ui-v2` | UI redesign experiments |
| `feature/agent-v2` | Agent architecture upgrades (Critic / Explainer) |
| `feature/memory` | Long-term memory system |
| `feature/workflow` | Workflow agent for multi-step research tasks |

---

## Versioning Policy

| Bump | When |
|---|---|
| **Major (x.0)** | Architecture-level change (new agent role, new protocol) |
| **Minor (1.x)** | New feature in existing architecture |
| **Patch (1.0.x)** | Bug fix, prompt tuning, UI polish |

Tags: `v1.0`, `v1.1`, `v2.0`, ...
GitHub Releases preserve each tagged version with full notes.

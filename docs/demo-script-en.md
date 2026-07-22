# ResearchKit OS — Demo Script (90s, English)

**Video target**: OKX AI Genesis Hackathon submission, ≤ 90 seconds
**Voiceover language**: English
**Demo content**: Analyze one English paper (Transformer / "Attention Is All You Need")
**Live URL**: https://researchkit-mu.vercel.app
**ASP**: https://www.okx.ai/agents/6853

---

## Time-coded script

### 0:00 — 0:08  Hook
**Voiceover**: "Research papers pile up faster than we can read them. What if an AI research team could read, analyze, and summarize any paper for you in under a minute?"

**Screen**: Black screen → fade in ResearchKit OS logo + tagline "AI Research Operating System"

---

### 0:08 — 0:18  Problem & Product Intro
**Voiceover**: "Meet ResearchKit OS — a multi-agent research operating system. Drop in any paper, and a team of six specialized AI agents handles the rest."

**Screen**:
- Open https://researchkit-mu.vercel.app
- Show input box on first screen (with mode tabs visible: Text / URL / PDF / Batch)
- Briefly hover over the "Simple/Advanced" mode toggle in the corner

---

### 0:18 — 0:42  Live Demo — Input & Pipeline
**Voiceover**: "I'll paste the abstract of 'Attention Is All You Need' — the paper that introduced the Transformer."

**Screen**:
- Click the Text tab (already active by default)
- Paste Transformer abstract into input box
- Click "Analyze" button
- **CRITICAL**: Show the live progress bar advancing through 6 stages:
  - Stage 1: 📄 Document Loaded
  - Stage 2: 🧠 Plan Generated (Planner LLM decides which agents to invoke)
  - Stage 3: 🔬 Concepts Extracted (Reader + Analyzer + Terminology running in parallel)
  - Stage 4: 🏗️ Knowledge Card Built
  - Stage 5: 🔁 Reflection Loop (auto-iterate; if missing, Replan triggers)
  - Stage 6: 📤 Exports Ready

**Voiceover (during progress)**: "A Planner agent decides which agents to invoke. Reader, Analyzer, and Terminology run in parallel. A Reflection agent reviews the result — and if anything's missing, it triggers a Replan loop to fill the gaps. The whole pipeline is locale-aware — it reasons in the source language, then renders in the target language, so English papers stay English, Chinese papers stay Chinese."

---

### 0:42 — 1:00  Output Showcase — Knowledge Card
**Voiceover**: "The Knowledge Card gives me the one-sentence takeaway, why it matters, what surprised me, and who should read it — not generic metadata, but value judgments from a senior researcher's perspective."

**Screen**:
- Scroll to Knowledge Card section
- Expand each field one by one (use accordion animation):
  - 🎯 Takeaway
  - 💭 Why It Matters
  - ✨ What Surprised Me
  - 👥 Who Should Read
- Briefly show Quality Score (completeness / confidence / evidence) at the bottom

---

### 1:00 — 1:18  Output Showcase — Term Graph + Recommendations
**Voiceover**: "The Terminology agent builds a knowledge graph — each term links to its prerequisites, with importance ratings from 1 to 5. And the Recommendation agent finds follow-up papers across four intents: improve, challenge, apply, and survey."

**Screen**:
- Scroll to Mermaid knowledge graph (term DAG with importance-sized nodes)
- Hover one node to show its prerequisite edges highlighting
- Scroll down to 4 recommendation chips (improve / challenge / apply / survey)
- Click one chip to expand its reason

---

### 1:18 — 1:30  Export + CTA
**Voiceover**: "Export to Markdown, Obsidian, or JSON — ready for your second brain. ResearchKit OS — your AI research team, on OKX.AI."

**Screen**:
- Click "Download Markdown" button (show file appearing in browser download bar)
- Click "Copy Obsidian" button (show "Copied!" pulse animation)
- Final frame (hold 3 seconds): ResearchKit OS logo + "Built for OKX AI Genesis Hackathon #OKXAI" + URL `researchkit-mu.vercel.app` + ASP URL `okx.ai/agents/6853`

---

## Recording checklist

### Before recording
- [ ] Close all other browser tabs / apps
- [ ] Set screen resolution to 1920x1080
- [ ] Test microphone levels (record 10s and listen back)
- [ ] Pre-run the demo once to warm up the LLM cache (faster response on camera)
- [ ] Zoom browser to 110% so UI elements are clearly visible
- [ ] Have Transformer paper abstract ready in clipboard (see below)

### During recording
- [ ] Use OBS Studio or Loom (free, no watermark)
- [ ] Record at 30fps, 1080p
- [ ] Record system audio OFF, microphone ON
- [ ] Pause 1-2 seconds between each section to make editing easier
- [ ] Don't show your face — screen recording + voiceover only (cleaner for demo)

### After recording
- [ ] Trim to ≤ 90s strict (OBS can export with cuts)
- [ ] Add subtitle track (optional — recommended for accessibility)
- [ ] Export as MP4, H.264, ≤ 50MB
- [ ] Upload to YouTube as Unlisted (or Twitter directly)
- [ ] Get share link for Twitter post

---

## Voiceover tips (English)

- **Slow down**: speak 10-15% slower than conversational pace
- **Stress keywords**: "Multi-agent", "parallel", "Reflection loop", "Replan", "knowledge graph", "locale-aware"
- **Pause at transitions**: 0.5s pause between sections makes it feel less rushed
- **Avoid filler**: cut "um", "uh", "so" — replace with silence
- **Practice run**: read the script aloud 3 times before recording

---

## Transformer paper abstract (paste into input)

```
The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely. Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train. Our model achieves 28.4 BLEU on the WMT 2014 English-to-German translation task, improving over the existing best results, including ensembles, by over 2 BLEU. On the WMT 2014 English-to-French translation task, our model establishes a new single-model state-of-the-art BLEU score of 41.8 after training for 3.5 days on eight GPUs, a small fraction of the training costs of the best models from the literature. We show that the Transformer generalizes well to other tasks by applying it successfully to English constituency parsing both with large and limited training data.
```

---

## Fallback if live demo fails during recording

If LLM is slow or fails on camera:
1. Pre-record a successful run before the live demo attempt (recommended)
2. Use the pre-recording as the demo footage
3. Add a small "pre-recorded" disclaimer at bottom corner (optional — most hackathons accept this)

The judges care about the product, not the live performance. A polished pre-recorded demo beats a buggy live one.

---

## OKX.AI ASP quick reference (for end frame + voiceover accuracy)

| Field | Value |
|---|---|
| ASP ID | #6853 |
| Service name | Paper Analysis Service |
| Service type | A2MCP (free, 0 USDT) |
| Endpoint | `https://researchkit-mu.vercel.app/api/research/multi-agent-stream` |
| Network | X Layer |
| ASP URL | https://www.okx.ai/agents/6853 |

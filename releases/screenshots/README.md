# Release Screenshots

This directory stores screenshots referenced in GitHub Releases and the README.

## Naming Convention

```
v<version>-<screen-name>.png

# Examples:
v1.0-home.png
v1.0-knowledge-card.png
v1.0-knowledge-graph.png
v1.0-pipeline-progress.png
v1.0-exports-markdown.png
```

## Required Screenshots per Release

For each major release, capture and commit:

1. `home.png` — first-screen with input box visible
2. `pipeline-progress.png` — 6-agent progress panel mid-execution
3. `knowledge-card.png` — completed knowledge card (Accordion expanded)
4. `knowledge-graph.png` — Mermaid Knowledge Graph rendered
5. `exports-markdown.png` — Markdown export preview
6. `exports-obsidian.png` — Obsidian export preview

## How to Capture

1. Open https://researchkit-mu.vercel.app
2. Click "Load Example" to pre-fill the Transformer paper abstract
3. Click "Generate" and screenshot at each stage
4. Save as PNG, 1920×1080 or higher
5. Commit with: `git add releases/screenshots/*.png && git commit -m "docs: add v1.0 release screenshots"`

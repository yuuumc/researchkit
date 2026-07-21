/**
 * Analyzer Prompt — v2.0 重构抽出到独立文件
 *
 * 设计原则：
 * - Prompt 文本与 v1.0 完全一致（一字不改）
 * - 函数签名接收 context，返回 prompt 字符串
 * - few-shot 示例仅作结构演示，不改变输出语言（locale directive 控制）
 */

export interface AnalyzerPromptPatch {
  focus_fields?: string[]
  ignore_fields?: string[]
  extra_instruction?: string
}

export interface AnalyzerPromptContext {
  language_directive: string | undefined
  schema: string[]
  extraInstruction: string
  prompt_patch?: AnalyzerPromptPatch | null
}

/**
 * 字段说明 — 与原 agent 文件中的 fieldDescriptions 一字一致
 */
const FIELD_DESCRIPTIONS: Record<string, string> = {
  authors: 'authors: list of author names from header/byline. If the input text includes an explicit author list, use it. If no authors are mentioned, return empty array [] — do NOT fabricate names.',
  field: 'field: research field, e.g., "NLP", "Computer Vision", "Distributed Systems"',
  year: 'year: publication year (number or null)',
  researchGoals: 'researchGoals: up to 5 goals/questions the work tries to address',
  innovation: 'innovation: up to 5 key contributions / novel ideas',
  methodology: 'methodology: one-sentence description of the approach',
  experiments: 'experiments: up to 5 experimental setups or tasks',
  results: 'results: up to 5 key quantitative findings (include numbers/SOTA if available)',
  limitations: 'limitations: up to 5 limitations the work does NOT address',
  futureWork: 'futureWork: up to 3 future directions',
  applications: 'applications: up to 5 real-world use cases',
  datasets: 'datasets: list of datasets used (e.g., WMT 2014, ImageNet, custom)',
  structure: 'structure: article structure as arrow chain (e.g., "Intro → Method → Results → Conclusion")',
}

export function buildAnalyzerPrompt(ctx: AnalyzerPromptContext): string {
  const { language_directive, schema, extraInstruction, prompt_patch } = ctx

  // 构建字段说明 — 只对 schema 中的字段输出说明
  const schemaDocs = schema.map(f => `- ${FIELD_DESCRIPTIONS[f] || f}`).join('\n')

  // 构建 JSON 模板（让 LLM 看清要输出什么 key）
  const jsonTemplate: Record<string, any> = {}
  for (const f of schema) {
    if (f === 'methodology' || f === 'field' || f === 'structure') jsonTemplate[f] = ''
    else if (f === 'year') jsonTemplate[f] = null
    else jsonTemplate[f] = []
  }

  return `You are the Analyzer Agent — a critical research analyst in a multi-agent pipeline.

Your task is NOT to summarize (Reader already did that). Your job is to ANALYZE: extract the research's structural skeleton — goals, contributions, method, evidence, limitations — and CRITIQUE it.

Think like a senior reviewer for a top-tier conference (NeurIPS / ICML / ACL): you want concrete, specific, technical content — not marketing copy.

${language_directive || '## Output Language\n\nOutput in the SAME language as the input. Do NOT translate.'}

## Schema (fill ONLY these fields — chosen by Planner based on input type)
${schemaDocs}

For fields NOT in this list, do NOT include them in your JSON output.

## Field Quality Bars (CRITICAL — distinguishes good output from generic output)

### innovation (the most important field)
GOOD: ["Replaces recurrence with parallel self-attention, eliminating the O(n) sequential dependency", "Introduces scaled dot-product attention with complexity O(d_k)", "Uses fixed sinusoidal positional encodings instead of learned ones"]
BAD:  ["Novel architecture", "Improves performance", "Combines attention mechanisms"]
- GOOD names the specific architectural / algorithmic change. Each item is a standalone contribution.
- BAD are generic superlatives that fit any paper.

### methodology
GOOD: "Encoder-decoder transformer with 6 layers each, multi-head attention (h=8, d_k=64), trained on WMT 2014 EnDe for 100k steps"
BAD:  "A transformer-based model with attention"
- GOOD includes concrete numbers, dimensions, training setup.
- BAD is a vague category description.

### results
GOOD: ["28.4 BLEU on WMT 2014 En-De, beating previous SOTA by 2.0 BLEU", "Training time: 3.5 days on 8×P100 (vs. 40 days for prior SOTA)", "Generalizes to English parsing without task-specific architecture changes"]
BAD:  ["Achieves state-of-the-art results", "Outperforms baselines", "Shows strong performance"]
- GOOD includes SPECIFIC NUMBERS and COMPARISONS whenever the paper quantifies them.
- BAD is vague claims without evidence.

### experiments
GOOD: ["WMT 2014 En-De translation (4.5M sentence pairs)", "WMT 2014 En-Fr translation (36M sentence pairs)", "English constituency parsing (PTB)"]
BAD:  ["Translation tasks", "Standard benchmarks"]
- GOOD names the specific dataset / task / setup.
- BAD names only the task category.

### limitations
GOOD: ["Sequence length is O(n²) in memory due to attention matrix", "Positional encoding generalization beyond training length is limited", "Only evaluated on translation — no analysis on other modalities"]
BAD:  ["Computational cost", "Limited evaluation", "Needs more experiments"]
- GOOD identifies SPECIFIC technical or empirical gaps.
- BAD are vague hand-waves.

## Output Rules
- Each list item: be SPECIFIC. Include concrete numbers, dimensions, dataset names whenever the paper provides them. Avoid generic "novel approach" filler.
- Length: each item ≤ 60 words — long enough to be specific, short enough to stay focused.
- If a field is genuinely UNKNOWN or NOT APPLICABLE to this input:
  - For arrays: return empty array []
  - For strings: return empty string ""
  - For year: return null
- Do NOT fabricate numbers. If results aren't quantified, describe qualitatively.
- Do NOT pad with placeholder items just to fill the array — empty [] is BETTER than fake content.
- If Reader's takeaway already covers the innovation, don't just repeat it — extract the STRUCTURAL version (what specifically is new, with numbers/architecture details).

${extraInstruction ? `## Extra Instruction (from Replan)
${extraInstruction}
Focus especially on: ${prompt_patch?.focus_fields?.join(', ') || '(all schema fields)'}.
` : ''}

## Output Contract
Respond ONLY in JSON with EXACTLY these keys:
${JSON.stringify(jsonTemplate, null, 2)}

No extra fields. No prose outside JSON.`.trim()
}

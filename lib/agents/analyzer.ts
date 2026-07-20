/**
 * Analyzer Agent — 深度研究分析
 *
 * 设计哲学（升级版）：
 * - 字段动态化：由 Planner 决定该 input_type 需要哪些 schema 字段（CV 要 datasets，数学论文不要）
 * - 严格无值：未知字段返回 null / []，不再编造（避免"看起来很完整但全空"）
 * - 合并 structure：原 Reader 的 structure 字段并入 Analyzer，因为只有分析后才懂结构
 * - few-shot 示例：稳定输出格式
 *
 * 输入：
 *   - content: 原文
 *   - readerOutput: Reader 的输出（含 takeaway，Analyzer 可引用避免重复）
 *   - required_schema: Planner 决定的字段清单（可选；不传则全部字段都试）
 */

import OpenAI from 'openai'
import { Agent, AgentMessage, createMessage } from '../mcp'
import type { ReaderOutput } from './reader'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: (process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1').trim(),
})

const LLM_MODEL = process.env.LLM_MODEL?.trim() || 'deepseek-v4-flash'

/**
 * 所有可能的 Analyzer 字段
 * Planner 根据 input_type 决定要求 LLM 填哪些
 */
export const ANALYZER_FIELDS = [
  'authors',          // 作者（如果 Reader 没抓到，Analyzer 在正文里找）
  'field',            // 学科领域
  'year',             // 年份
  'researchGoals',    // 研究目的
  'innovation',       // 创新点
  'methodology',      // 方法论
  'experiments',      // 实验
  'results',          // 结果
  'limitations',      // 局限性
  'futureWork',       // 未来工作
  'applications',     // 应用
  'datasets',         // 数据集
  'structure',        // 文章结构（合并自 Reader）
] as const

export type AnalyzerField = typeof ANALYZER_FIELDS[number]

export interface AnalyzerOutput {
  // 旧字段（向后兼容）
  coreArguments: string[]
  methodology: string
  actionableTakeaways: string[]
  limitations: string[]

  // 新字段
  authors: string[]
  field: string
  year?: number
  researchGoals: string[]
  innovation: string[]
  experiments: string[]
  results: string[]
  futureWork: string[]
  applications: string[]
  datasets: string[]
  structure: string         // 合并自 Reader
}

/**
 * 根据 input_type 决定 required_schema
 * 这个映射也可以被 Planner 覆盖（Planner 传 required_schema 时优先用 Planner 的）
 */
export const DEFAULT_SCHEMA_BY_INPUT_TYPE: Record<string, AnalyzerField[]> = {
  paper: ['authors', 'field', 'year', 'researchGoals', 'innovation', 'methodology', 'experiments', 'results', 'limitations', 'futureWork', 'datasets', 'structure'],
  documentation: ['innovation', 'methodology', 'applications', 'structure'],
  url: ['innovation', 'methodology', 'applications', 'structure'],
  general_text: ['innovation', 'methodology', 'structure'],
  unknown: ['authors', 'field', 'year', 'researchGoals', 'innovation', 'methodology', 'experiments', 'results', 'limitations', 'futureWork', 'applications', 'datasets', 'structure'],
}

export const AnalyzerAgent: Agent = {
  name: 'Analyzer',
  description: '深度分析论文，按 Planner 决定的 schema 输出结构化研究档案',
  capabilities: [
    {
      name: 'analyze',
      description: '按 required_schema 提取字段，未在 schema 中的字段不返回',
      inputs: ['text', 'readerOutput', 'required_schema'],
      outputs: ['researchGoals', 'innovation', 'methodology', 'experiments', 'results', 'limitations', 'futureWork', 'applications', 'datasets', 'authors', 'field', 'year', 'structure'],
    },
  ],

  async handleMessage(message: AgentMessage): Promise<AgentMessage> {
    if (message.type !== 'task') {
      return createMessage('error', 'Analyzer', message.from, { error: '只处理 task 类型消息' })
    }

    const { content, readerOutput, required_schema, input_type, prompt_patch, language_directive } = message.payload

    // 决定 schema：Planner 传入的优先，否则按 input_type 选默认，再不行全部字段
    let schema: AnalyzerField[] = (Array.isArray(required_schema) && required_schema.length > 0)
      ? required_schema
      : (input_type ? DEFAULT_SCHEMA_BY_INPUT_TYPE[input_type] : undefined) || DEFAULT_SCHEMA_BY_INPUT_TYPE.unknown

    // 升级版：如果有 prompt_patch（Replan 阶段的补丁），调整 schema
    // - focus_fields 加入 schema
    // - ignore_fields 从 schema 移除
    let extraInstruction = ''
    if (prompt_patch) {
      const focus: string[] = prompt_patch.focus_fields || []
      const ignore: string[] = prompt_patch.ignore_fields || []
      extraInstruction = prompt_patch.extra_instruction || ''

      // 移除 ignore
      schema = schema.filter(f => !ignore.includes(f))
      // 加入 focus（去重）
      for (const f of focus) {
        if (!schema.includes(f as AnalyzerField)) {
          schema.push(f as AnalyzerField)
        }
      }
    }

    if (schema.length === 0) {
      schema = DEFAULT_SCHEMA_BY_INPUT_TYPE.unknown
    }

    // 构建字段说明 — 只对 schema 中的字段输出说明
    const fieldDescriptions: Record<AnalyzerField, string> = {
      authors: 'authors: list of author names from header/byline (if Reader missed them)',
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

    const schemaDocs = schema.map(f => `- ${fieldDescriptions[f]}`).join('\n')

    // 构建 JSON 模板（让 LLM 看清要输出什么 key）
    const jsonTemplate: Record<string, any> = {}
    for (const f of schema) {
      if (f === 'methodology' || f === 'field' || f === 'structure') jsonTemplate[f] = ''
      else if (f === 'year') jsonTemplate[f] = null
      else jsonTemplate[f] = []
    }

    const response = await openai.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are the Analyzer Agent — a critical research analyst in a multi-agent pipeline.

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

No extra fields. No prose outside JSON.`,
        },
        {
          role: 'user',
          content: `Reader takeaway (use as context, don't repeat):
${readerOutput?.takeaway || readerOutput?.summary || 'N/A'}

Original text:
${content.substring(0, 20000)}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })

    const raw = response.choices[0]?.message?.content || '{}'
    let parsed: any
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      console.error('[Analyzer] LLM 返回非 JSON:', raw.substring(0, 500))
      throw new Error('Analyzer LLM 返回非 JSON 格式（可能限流或返回错误文本）')
    }

    // ===== 按 schema 提取，未在 schema 中的字段填默认值 =====
    const getArray = (f: AnalyzerField): string[] => schema.includes(f) ? (parsed[f] || []) : []
    const getString = (f: AnalyzerField): string => schema.includes(f) ? (parsed[f] || '') : ''

    const output: AnalyzerOutput = {
      // 旧字段（向后兼容）
      coreArguments: getArray('innovation'),
      actionableTakeaways: getArray('applications'),
      methodology: getString('methodology'),
      limitations: getArray('limitations'),

      // 新字段
      authors: getArray('authors'),
      field: getString('field'),
      year: schema.includes('year') ? (parsed.year || undefined) : undefined,
      researchGoals: getArray('researchGoals'),
      innovation: getArray('innovation'),
      experiments: getArray('experiments'),
      results: getArray('results'),
      futureWork: getArray('futureWork'),
      applications: getArray('applications'),
      datasets: getArray('datasets'),
      structure: getString('structure'),
    }

    return createMessage('result', 'Analyzer', message.from, output, message.id)
  },

  getCapabilities() {
    return this.capabilities
  },
}

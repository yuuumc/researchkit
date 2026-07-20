/**
 * Planner Agent — LLM 驱动的自主规划器（升级版）
 *
 * 升级要点：
 * - 减少硬规则，增加"原则" — 让 LLM 自主判断而非按规则表执行
 * - 加 Think step-by-step 显式推理
 * - 输出 required_schema 给 Analyzer — 字段动态化
 * - XML 标签分段提升 prompt 可读性
 *
 * 评委可视化关键点：
 * 1. rationale（为什么这样规划）
 * 2. required_schema（Planner 主动决定 Analyzer 提取哪些字段）
 * 3. skip（自主决定跳过某 Agent）
 * 4. parallel_group（自主决定并行/串行）
 * 5. tool_calls（LLM 自主决定调哪些 MCP 工具）
 */

import OpenAI from 'openai'
import { Agent, AgentMessage, createMessage, AgentCapability } from './mcp'
import { formatToolsForPrompt } from './tools/registry'
import { detectLocale, Locale, buildLanguageDirective } from './locale'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: (process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1').trim(),
})

const LLM_MODEL = process.env.LLM_MODEL?.trim() || 'deepseek-v4-flash'

export interface PlanStep {
  id: string               // 'step-1' | 'step-2' ...
  agent: string            // 'Reader' | 'Analyzer' | 'Terminology' | 'KnowledgeBuilder' | 'Recommendation' | 'Export'
  reason: string           // LLM 给出的：为什么调这个 Agent
  parallel_group: number   // 同组的并行执行；不同组串行
  depends_on: string[]     // 依赖的 step id
  required: boolean        // true=必须跑；false=可选/视情况
}

export interface PlannedToolCall {
  id: string
  tool: string
  reason: string
  input: Record<string, any>
  run_after: string
}

/**
 * Planner 输出的 Analyzer schema 决策
 * 决定 Analyzer 提取哪些字段（避免 14 字段一刀切）
 */
export type AnalyzerField =
  | 'authors' | 'field' | 'year' | 'researchGoals' | 'innovation'
  | 'methodology' | 'experiments' | 'results' | 'limitations'
  | 'futureWork' | 'applications' | 'datasets' | 'structure'

export interface Plan {
  rationale: string
  input_type: 'paper' | 'documentation' | 'url' | 'general_text' | 'unknown'
  complexity: 'low' | 'medium' | 'high'
  estimated_steps: number
  steps: PlanStep[]
  tool_calls: PlannedToolCall[]
  required_schema: AnalyzerField[]   // 升级版新增：传给 Analyzer
}

export interface PlannerOutput {
  plan: Plan
}

const AGENT_REGISTRY: Array<{ name: string; description: string; capability: string }> = [
  { name: 'Reader',           description: '理解论文：takeaway / whyItMatters / whatSurprised / whoShouldRead / readingDifficulty', capability: 'read' },
  { name: 'Analyzer',         description: '深度分析：按 Planner 决定的 schema 提取（researchGoals/innovation/methodology/experiments/results/limitations/futureWork/applications/datasets/structure/authors/field/year）', capability: 'analyze' },
  { name: 'Terminology',       description: '术语图谱：term + definition + category + importance (1-5) + prerequisite (DAG)', capability: 'extractTerms' },
  { name: 'KnowledgeBuilder',  description: '汇总各 Agent 结果，构建最终知识卡（必须执行，依赖 Reader/Analyzer/Terminology）', capability: 'build' },
  { name: 'Recommendation',    description: '4 类 intent 推荐阅读：improve / challenge / apply / survey（仅对学术论文有意义）', capability: 'recommend' },
  { name: 'Export',            description: '导出 Markdown / Obsidian / JSON / Mermaid Mindmap（必须执行，依赖 KnowledgeBuilder）', capability: 'export' },
]

export const PlannerAgent: Agent = {
  name: 'Planner',
  description: 'LLM 驱动的自主规划器，根据输入决定调哪些 Agent、Analyzer 提取哪些字段、调哪些 MCP 工具',
  capabilities: [
    {
      name: 'plan',
      description: '根据输入内容、可用 Agent 和 MCP 工具，输出执行计划 + required_schema',
      inputs: ['content', 'availableAgents', 'availableTools'],
      outputs: ['plan', 'required_schema'],
    },
  ],

  async handleMessage(message: AgentMessage): Promise<AgentMessage> {
    if (message.type !== 'task') {
      return createMessage('error', 'Planner', message.from, { error: '只处理 task 类型消息' })
    }

    const { content, language_directive } = message.payload

    // Locale 检测（升级版：从 coordinator 传入或本地检测）
    const sourceLocale: Locale = message.payload.source_locale || detectLocale(content)
    const targetLocale: Locale = message.payload.target_locale || sourceLocale
    const finalLanguageDirective = language_directive || buildLanguageDirective(sourceLocale, targetLocale)

    const agentListText = AGENT_REGISTRY.map(a => `- ${a.name}: ${a.description}`).join('\n')
    const toolsText = formatToolsForPrompt()

    const response = await openai.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are the Planner Agent — the brain of a multi-agent research pipeline.

You are NOT following a fixed rulebook. You are an autonomous planner who thinks step-by-step about WHAT information value each agent would add, and SKIPS agents whose value is low for this specific input.

${finalLanguageDirective}

NOTE: Schema field NAMES stay in English (they are code identifiers, not display text). Only natural-language fields like "rationale" and "reason" follow the language directive above.

## Available Agents
${agentListText}

## Available Tools
${toolsText}

## Principles
1. Maximize information value per token spent — only invoke agents that meaningfully add to the knowledge card.
2. Minimize cost — for short or non-research inputs, skip Recommendation and Terminology.
3. Preserve structural correctness — KnowledgeBuilder depends on Reader OR Analyzer; Export depends on KnowledgeBuilder.
4. Parallelize when safe — Reader/Analyzer/Terminology can run in parallel.
5. Decide Analyzer's schema dynamically — pick ONLY the fields that match this input type (e.g., skip "datasets" for math papers, skip "futureWork" for product docs).
6. Tool calls should serve the user, not be ceremony — memory.save always; filesystem.save always; arxiv.search SKIP (Recommendation agent handles it).

## Think Step-by-Step
Before producing JSON, internally consider:
- What type of input is this? (academic paper / documentation / blog / product page / general text)
- What is the user likely to do with the knowledge card? (study / cite / build on / make decision)
- Which agents will add real value? Which can be skipped?
- What schema fields does this input type actually have? (Don't ask Analyzer to extract "datasets" from a math proof.)
- Which MCP tools are genuinely needed vs. ceremonial?

## Structural Example (for STRUCTURE only — output language follows the language directive above)
Input: Transformer paper "Attention Is All You Need"
Output:
{
  "rationale": "Classic NLP architecture paper with experiments — extract full research profile.",
  "input_type": "paper",
  "complexity": "high",
  "required_schema": ["authors","field","year","researchGoals","innovation","methodology","experiments","results","limitations","datasets","structure"],
  "steps": [
    {"id":"step-1","agent":"Reader","reason":"Extract value judgment: what makes this paper a paradigm shift.","parallel_group":1,"depends_on":[],"required":true},
    {"id":"step-2","agent":"Analyzer","reason":"Extract architectural details, datasets, and BLEU results.","parallel_group":1,"depends_on":[],"required":true},
    {"id":"step-3","agent":"Terminology","reason":"Build term graph for self-attention, multi-head, positional encoding.","parallel_group":1,"depends_on":[],"required":true},
    {"id":"step-4","agent":"KnowledgeBuilder","reason":"Merge all outputs into a knowledge card.","parallel_group":2,"depends_on":["step-1","step-2","step-3"],"required":true},
    {"id":"step-5","agent":"Recommendation","reason":"Find follow-up papers (BERT, GPT, Linformer, etc.)","parallel_group":3,"depends_on":["step-4"],"required":true},
    {"id":"step-6","agent":"Export","reason":"Generate Markdown, JSON, Obsidian exports.","parallel_group":4,"depends_on":["step-4"],"required":true}
  ],
  "tool_calls": [
    {"id":"tool-1","tool":"memory","reason":"Save to agent memory for future recall.","input":{"action":"save"},"run_after":"step-4"},
    {"id":"tool-2","tool":"filesystem","reason":"Save Markdown export to disk.","input":{"action":"save_markdown"},"run_after":"step-6"}
  ]
}

Note: This example uses English text for STRUCTURE demonstration. Your rationale and reason fields MUST follow the target language (per the language directive above), NOT the example language.

## Analyzer Schema Options
Choose a SUBSET of these fields for Analyzer to extract:
- authors, field, year, researchGoals, innovation, methodology, experiments, results, limitations, futureWork, applications, datasets, structure

Examples:
- NLP paper with experiments → ['authors','field','year','researchGoals','innovation','methodology','experiments','results','limitations','datasets','structure']
- Math proof paper → ['authors','field','year','researchGoals','innovation','methodology','limitations','structure']
- Product documentation → ['innovation','methodology','applications','structure']
- Blog post → ['innovation','structure']

## Output Contract
Respond ONLY in JSON:
{
  "rationale": "1-2 sentences explaining the overall reasoning (in the target language)",
  "input_type": "paper | documentation | url | general_text | unknown",
  "complexity": "low | medium | high",
  "required_schema": ["...subset of analyzer fields..."],
  "steps": [
    {
      "id": "step-1",
      "agent": "Reader",
      "reason": "one sentence (in the target language): why call this agent",
      "parallel_group": 1,
      "depends_on": [],
      "required": true
    }
  ],
  "tool_calls": [
    {
      "id": "tool-1",
      "tool": "memory",
      "reason": "one sentence (in the target language)",
      "input": { "action": "save" },
      "run_after": "step-4"
    }
  ]
}

Always include: KnowledgeBuilder + Export in steps. Always include: memory.save + filesystem.save_markdown in tool_calls.`,
        },
        {
          role: 'user',
          content: `Input preview (first 1500 chars):\n${content.substring(0, 1500)}\n\nTotal length: ${content.length} chars\n\nProduce the plan with steps, tool_calls, and required_schema.`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    })

    const raw = response.choices[0]?.message?.content || '{}'
    let parsed: any
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      console.error('[Planner] LLM 返回非 JSON:', raw.substring(0, 500))
      throw new Error('Planner LLM 返回非 JSON 格式（可能限流或返回错误文本）')
    }

    // 关键校验：如果 LLM 没返回 steps，直接抛错让 coordinator 走 fallbackPlan
    // 否则会生成只含 KB+Export 的 plan，导致 Reader/Analyzer/Terminology 都不会被调用
    if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      console.error('[Planner] LLM 未返回有效的 steps:', raw.substring(0, 500))
      throw new Error('Planner 未返回有效 steps（LLM 响应缺少 steps 数组）')
    }

    const validSchemaFields: string[] = [
      'authors', 'field', 'year', 'researchGoals', 'innovation',
      'methodology', 'experiments', 'results', 'limitations',
      'futureWork', 'applications', 'datasets', 'structure',
    ]
    const requiredSchema: AnalyzerField[] = ((parsed.required_schema || []) as any[])
      .filter((f: any) => typeof f === 'string' && validSchemaFields.includes(f)) as AnalyzerField[]
    // 兜底：如果 LLM 没给 schema，用 input_type 默认
    if (requiredSchema.length === 0) {
      const fallback: Record<string, AnalyzerField[]> = {
        paper: ['authors', 'field', 'year', 'researchGoals', 'innovation', 'methodology', 'experiments', 'results', 'limitations', 'datasets', 'structure'],
        documentation: ['innovation', 'methodology', 'applications', 'structure'],
        url: ['innovation', 'methodology', 'applications', 'structure'],
        general_text: ['innovation', 'methodology', 'structure'],
        unknown: ['innovation', 'methodology', 'structure'],
      }
      requiredSchema.push(...(fallback[parsed.input_type] || fallback.unknown))
    }

    const steps: PlanStep[] = (parsed.steps || []).map((s: any, i: number) => ({
      id: s.id || `step-${i + 1}`,
      agent: s.agent,
      reason: s.reason || '',
      parallel_group: s.parallel_group || 1,
      depends_on: s.depends_on || [],
      required: s.required !== false,
    }))

    const agentNames = steps.map(s => s.agent)
    if (!agentNames.includes('KnowledgeBuilder')) {
      const lastParallelGroup = Math.max(0, ...steps.map(s => s.parallel_group))
      steps.push({
        id: `step-${steps.length + 1}`,
        agent: 'KnowledgeBuilder',
        reason: '汇总各 Agent 结果，构建最终知识卡',
        parallel_group: lastParallelGroup + 1,
        depends_on: steps.filter(s => ['Reader', 'Analyzer', 'Terminology'].includes(s.agent)).map(s => s.id),
        required: true,
      })
    }
    if (!agentNames.includes('Export')) {
      const lastParallelGroup = Math.max(0, ...steps.map(s => s.parallel_group))
      steps.push({
        id: `step-${steps.length + 1}`,
        agent: 'Export',
        reason: '导出知识卡为 Markdown / Obsidian / JSON / Mermaid Mindmap',
        parallel_group: lastParallelGroup + 1,
        depends_on: steps.filter(s => s.agent === 'KnowledgeBuilder').map(s => s.id),
        required: true,
      })
    }

    const tool_calls: PlannedToolCall[] = (parsed.tool_calls || []).map((t: any, i: number) => ({
      id: t.id || `tool-${i + 1}`,
      tool: t.tool,
      reason: t.reason || '',
      input: t.input || {},
      run_after: t.run_after || 'pipeline_end',
    }))

    const plan: Plan = {
      rationale: parsed.rationale || '根据输入内容自动规划',
      input_type: parsed.input_type || 'unknown',
      complexity: parsed.complexity || 'medium',
      estimated_steps: steps.length,
      steps,
      tool_calls,
      required_schema: requiredSchema,
    }

    return createMessage('result', 'Planner', message.from, { plan } as PlannerOutput, message.id)
  },

  getCapabilities() {
    return this.capabilities
  },
}

/**
 * Reflection — 从"检查"升级为"Review"
 *
 * 升级要点：
 * - 不只看字段是否为空，而是评估知识卡是否真正有用
 * - 3 维度评估：
 *   1. Student value: 一个本科生读完这份知识卡能理解论文核心吗？
 *   2. Researcher trust: 一个该领域研究员会信任这份总结吗？
 *   3. Confusion: 是否有任何令人困惑或缺失的关键信息？
 */
export interface ReflectionResult {
  satisfied: boolean
  missing: string[]                    // 缺失的 agent 或字段
  reasoning: string
  additional_steps: PlanStep[]
  review: {
    student_useful: boolean             // 本科生读完能懂吗
    researcher_trust: boolean           // 研究员会信任吗
    has_confusion: boolean              // 有令人困惑的部分吗
    confusion_points: string[]         // 具体哪里令人困惑
  }
}

export async function reflect(
  plan: Plan,
  results: Record<string, any>,
  knowledgeCard: any,
  languageDirective?: string
): Promise<ReflectionResult> {
  const directive = languageDirective || `## Output Language\n\nOutput in the SAME language as the original input. Do NOT force Chinese for English papers.`

  try {
    const response = await openai.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are the Reflection Agent — a senior reviewer evaluating a knowledge card produced by a multi-agent pipeline.

You are NOT just a completeness checker. You are a REVIEWER asking: "Is this knowledge card genuinely USEFUL?"

${directive}

## Three Review Dimensions
1. STUDENT USEFUL: Could an undergrad read this card and walk away understanding the paper's core idea? (Requires a real takeaway, not just metadata.)
2. RESEARCHER TRUST: Would a domain expert trust this card as a faithful summary? (Requires specific innovation / results, not generic statements.)
3. CONFUSION: Is anything in the card confusing, contradictory, or missing context that a reader would need?

## Quantitative Thresholds
- If input is a real academic paper (has abstract, methodology, results sections) AND (innovation.length < 2 OR results.length < 1) → student_useful=false
- If innovation items are generic ("a novel approach") rather than specific → researcher_trust=false
- If terminology is empty for an academic input → has_confusion=true
- If summary is "Untitled" or empty → ALL three dimensions false
- If input is general text (blog/doc) and card has summary + innovation → satisfied=true (don't over-strict for non-research inputs)

## Output Contract
Respond ONLY in JSON:
{
  "satisfied": true | false,
  "missing": ["agent_name", ...],
  "reasoning": "one sentence overall review (in the target language)",
  "additional_steps": [],
  "review": {
    "student_useful": true | false,
    "researcher_trust": true | false,
    "has_confusion": true | false,
    "confusion_points": ["specific points that are confusing (in the target language)"]
  }
}`,
        },
        {
          role: 'user',
          content: `Plan input_type: ${plan.input_type}\nPlan complexity: ${plan.complexity}\nExecuted agents: ${Object.keys(results).join(', ')}\n\nKnowledge card:\n${JSON.stringify({
            title: knowledgeCard?.title,
            summary: knowledgeCard?.summary,
            takeaway: knowledgeCard?.takeaway,
            whyItMatters: knowledgeCard?.whyItMatters,
            innovation: knowledgeCard?.innovation,
            results: knowledgeCard?.results,
            limitations: knowledgeCard?.limitations,
            methodology: knowledgeCard?.methodology,
            key_terms_count: (knowledgeCard?.key_terms || []).length,
            applications: knowledgeCard?.applications,
          }, null, 2)}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })

    const raw = response.choices[0]?.message?.content || '{}'
    const parsed = JSON.parse(raw)

    const review = parsed.review || {}
    return {
      satisfied: parsed.satisfied !== false,
      missing: parsed.missing || [],
      reasoning: parsed.reasoning || '结果满足要求',
      additional_steps: parsed.additional_steps || [],
      review: {
        student_useful: review.student_useful !== false,
        researcher_trust: review.researcher_trust !== false,
        has_confusion: review.has_confusion === true,
        confusion_points: Array.isArray(review.confusion_points) ? review.confusion_points : [],
      },
    }
  } catch {
    return {
      satisfied: true,
      missing: [],
      reasoning: '反思跳过（LLM 调用失败）',
      additional_steps: [],
      review: {
        student_useful: true,
        researcher_trust: true,
        has_confusion: false,
        confusion_points: [],
      },
    }
  }
}

/**
 * Replan — Adaptive Prompt 补丁
 *
 * 升级要点（这才是真正的 Agent）：
 * - 不再只生成 supplementary_steps
 * - 为每个要重跑的 Agent 生成 FIELD-SPECIFIC FOCUSED PROMPT
 *   （例：Analyzer 第一次 methodology 空 → Replan 让 Analyzer 重跑时只 focus methodology）
 */
export interface ReplanResult {
  should_continue: boolean
  reasoning: string
  supplementary_steps: PlanStep[]
  adjust_prompt_for: string[]
  /**
   * 升级版新增：为每个要重跑的 agent 提供 focused prompt 补丁
   * key = agent name, value = 该 agent 这次重跑应该 focus 的字段
   */
  prompt_patches: Record<string, {
    focus_fields: string[]         // 这次只 focus 这些字段
    ignore_fields: string[]        // 这次忽略这些字段
    extra_instruction: string      // 给 LLM 的额外指令（中文）
  }>
}

export async function replan(
  originalPlan: Plan,
  reflection: ReflectionResult,
  executedSteps: any[],
  knowledgeCard: any,
  iteration: number,
  maxIterations: number = 2,
  languageDirective?: string
): Promise<ReplanResult> {
  if (iteration >= maxIterations) {
    return {
      should_continue: false,
      reasoning: `已达到最大迭代次数 ${maxIterations}，停止反思循环`,
      supplementary_steps: [],
      adjust_prompt_for: [],
      prompt_patches: {},
    }
  }

  if (reflection.satisfied) {
    return {
      should_continue: false,
      reasoning: 'Reflection 满意，无需补调',
      supplementary_steps: [],
      adjust_prompt_for: [],
      prompt_patches: {},
    }
  }

  const directive = languageDirective || `## Output Language\n\nOutput in the SAME language as the original input. Do NOT force Chinese for English papers.`

  try {
    const response = await openai.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are the Replan Agent — closing the agent loop with ADAPTIVE PROMPTING.

Not just "re-run agents". You decide HOW each agent should re-run with a FOCUSED prompt that targets the specific gap.

${directive}

## Input
- Original plan (already executed)
- Reflection result: identifies what's missing or confusing
- Current knowledge card state

## Decide
1. should_continue: true if there are meaningful gaps worth fixing
2. supplementary_steps: NEW steps to fill gaps (use step ids like "step-7")
3. prompt_patches: For each agent to re-run, give a FOCUSED instruction:
   - focus_fields: only extract these fields this time
   - ignore_fields: skip these fields to save tokens
   - extra_instruction: a sentence (in the target language) telling the agent what to fix specifically

Example: Analyzer's methodology was empty.
prompt_patches["Analyzer"] = {
  focus_fields: ["methodology"],
  ignore_fields: ["applications", "futureWork"],
  extra_instruction: "The methodology field was empty in the first run. Focus ONLY on methodology this time — analyze the paper's algorithm/model architecture in depth."
}

## Rules
1. Only re-run agents that reflection flagged as missing or produced empty/generic output.
2. supplementary_steps should depend on existing steps when they need prior context.
3. Maximum 3 supplementary steps per replan.
4. Each prompt_patch MUST include focus_fields and extra_instruction.
5. If reflection.satisfied is true or all missing agents already ran twice, return should_continue=false.

## Output Contract
Respond ONLY in JSON:
{
  "should_continue": true | false,
  "reasoning": "one sentence (in the target language): why continue/stop",
  "supplementary_steps": [
    {
      "id": "step-7",
      "agent": "Analyzer",
      "reason": "one sentence (in the target language): why re-run",
      "parallel_group": 10,
      "depends_on": ["step-1"],
      "required": true
    }
  ],
  "adjust_prompt_for": ["Analyzer"],
  "prompt_patches": {
    "Analyzer": {
      "focus_fields": ["methodology"],
      "ignore_fields": ["applications"],
      "extra_instruction": "one sentence (in the target language)"
    }
  }
}`,
        },
        {
          role: 'user',
          content: `Original plan:\n${JSON.stringify({ input_type: originalPlan.input_type, complexity: originalPlan.complexity, required_schema: originalPlan.required_schema }, null, 2)}\n\nReflection:\n${JSON.stringify({
            satisfied: reflection.satisfied,
            missing: reflection.missing,
            reasoning: reflection.reasoning,
            review: reflection.review,
          }, null, 2)}\n\nExecuted steps (agent + success + output preview):\n${executedSteps.map(e => `  - ${e.step.agent} (success=${e.success}): ${e.output ? JSON.stringify(e.output).substring(0, 200) : 'no output'}`).join('\n')}\n\nCurrent knowledge card:\n${JSON.stringify({
            title: knowledgeCard?.title,
            innovation_count: (knowledgeCard?.innovation || []).length,
            results_count: (knowledgeCard?.results || []).length,
            methodology: knowledgeCard?.methodology,
            limitations_count: (knowledgeCard?.limitations || []).length,
          }, null, 2)}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,  // 升级：从默认 1.0 降到 0.2，避免发散
    })

    const raw = response.choices[0]?.message?.content || '{}'
    const parsed = JSON.parse(raw)

    const supplementarySteps: PlanStep[] = (parsed.supplementary_steps || []).map((s: any, i: number) => ({
      id: s.id || `step-supplementary-${i + 1}`,
      agent: s.agent,
      reason: s.reason || '',
      parallel_group: s.parallel_group || 100 + i,
      depends_on: s.depends_on || [],
      required: s.required !== false,
    }))

    // 规范化 prompt_patches
    const promptPatches: Record<string, { focus_fields: string[]; ignore_fields: string[]; extra_instruction: string }> = {}
    if (parsed.prompt_patches && typeof parsed.prompt_patches === 'object') {
      for (const [agent, patch] of Object.entries(parsed.prompt_patches)) {
        const p = patch as any
        if (p && typeof p === 'object') {
          promptPatches[agent] = {
            focus_fields: Array.isArray(p.focus_fields) ? p.focus_fields.filter((f: any) => typeof f === 'string') : [],
            ignore_fields: Array.isArray(p.ignore_fields) ? p.ignore_fields.filter((f: any) => typeof f === 'string') : [],
            extra_instruction: typeof p.extra_instruction === 'string' ? p.extra_instruction : '',
          }
        }
      }
    }

    return {
      should_continue: parsed.should_continue === true,
      reasoning: parsed.reasoning || '（无推理）',
      supplementary_steps: supplementarySteps,
      adjust_prompt_for: Array.isArray(parsed.adjust_prompt_for) ? parsed.adjust_prompt_for : [],
      prompt_patches: promptPatches,
    }
  } catch {
    return {
      should_continue: false,
      reasoning: 'Replan 调用失败，跳过',
      supplementary_steps: [],
      adjust_prompt_for: [],
      prompt_patches: {},
    }
  }
}

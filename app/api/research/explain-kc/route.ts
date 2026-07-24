/**
 * Explain KC API — D11 Explain Agent
 *
 * POST /api/research/explain-kc
 * Body: {
 *   kc: KnowledgeCard,                          // 当前知识卡
 *   audience: 'high_school' | 'software_engineer' | 'researcher' | 'product_manager',
 * }
 * Response: {
 *   success: true,
 *   explanation: {                              // 结构化解释（不强求 JSON）
 *     summary: string,                          // 一句话总结
 *     whyItMatters: string,                     // 对该受众为什么重要
 *     coreConcept: string,                      // 核心概念（用类比/通俗语言）
 *     actionable: string,                       // 可执行洞察
 *     questions: string[],                      // 该受众应该追问的 3 个问题
 *     tags: string[],                           // 该受众关心的标签（如 "工程实现" / "商业价值"）
 *   },
 *   model: string,
 *   usage: ChatUsage,
 *   durationMs: number,
 * }
 *
 * 设计：
 * - 不走 coordinator — 单次 LLM 调用，简单 explain 不需要 plan/execute/reflect
 * - 不重新分析原文，只基于已生成的 KC 重新解释
 * - 受众驱动：不同受众看不同视角（高中生看类比 / 工程师看实现 / 研究员看贡献 / PM 看商业价值）
 * - 输出 JSON 结构化，方便 UI 渲染
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerProvider } from '@/lib/server-provider'
import { setCurrentAgent } from '@/lib/usage-collector'
import { buildAutoTranslateDirective, getServerUserPreferences } from '@/lib/server-user-preferences'
import { PromptBuilder } from '@/core/prompt'
import type { ChatMessage } from '@/core/llm/provider'
import type { KnowledgeCard } from '@/types/knowledge'

export const runtime = 'nodejs'
export const maxDuration = 60

// ============================================================================
// 受众类型 + 配置
// ============================================================================

export type Audience = 'high_school' | 'software_engineer' | 'researcher' | 'product_manager'

interface AudienceConfig {
  /** 显示名（中文） */
  label: string
  /** emoji 图标 */
  icon: string
  /** 受众描述（告诉 LLM 这是给谁看的） */
  description: string
  /** 解释重点（告诉 LLM 该受众关心什么） */
  focus: string
  /** 语言风格 */
  style: string
}

const AUDIENCES: Record<Audience, AudienceConfig> = {
  high_school: {
    label: '高中生',
    icon: '🎓',
    description: 'a curious high school student with basic science knowledge but no CS background',
    focus: 'Use everyday analogies (cooking, sports, music, etc.) to explain technical concepts. Avoid jargon. Connect to things they already know.',
    style: 'casual, friendly, enthusiastic — like a fun science teacher',
  },
  software_engineer: {
    label: '软件工程师',
    icon: '👨‍💻',
    description: 'a senior software engineer with 5+ years of experience, familiar with ML basics',
    focus: 'Focus on implementation details, system design trade-offs, code-level insights, and engineering challenges. Mention concrete technologies and patterns.',
    style: 'technical, precise, pragmatic — like a senior engineer reviewing a design doc',
  },
  researcher: {
    label: '研究员',
    icon: '🔬',
    description: 'a PhD student or academic researcher in the same field',
    focus: 'Be rigorous: cite specific contributions, methodology strengths/weaknesses, comparison to prior art, future research directions. Use academic terminology.',
    style: 'formal, critical, evidence-based — like a peer reviewer',
  },
  product_manager: {
    label: '产品经理',
    icon: '💼',
    description: 'a product manager evaluating this technology for potential product integration',
    focus: 'Translate technical contribution into business value. Identify user scenarios, market opportunities, integration costs, risks, and ROI.',
    style: 'business-oriented, strategic, concise — like a tech brief for executives',
  },
}

// ============================================================================
// 入口
// ============================================================================

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await req.json()
    const kc = body.kc as KnowledgeCard
    const audience = body.audience as Audience

    // 参数校验
    if (!kc || !kc.title) {
      return NextResponse.json(
        { success: false, error: '缺少 KnowledgeCard 或 title' },
        { status: 400 }
      )
    }
    if (!audience || !AUDIENCES[audience]) {
      return NextResponse.json(
        { success: false, error: `无效的 audience，可选: ${Object.keys(AUDIENCES).join(' / ')}` },
        { status: 400 }
      )
    }

    const cfg = AUDIENCES[audience]

    // 标记当前 Agent
    setCurrentAgent('Explain')

    const provider = getServerProvider()

    const messages = buildExplainPrompt(kc, cfg)

    const response = await provider.chat(messages, {
      responseFormat: 'json_object',
      temperature: 0.5, // 略高 — 让解释更有创意（类比/比喻）
      timeout: 45_000,
    })

    if (!response.content) {
      return NextResponse.json(
        { success: false, error: 'LLM 返回空内容' },
        { status: 502 }
      )
    }

    let parsed: any
    try {
      parsed = JSON.parse(response.content)
    } catch (err) {
      console.error('[explain-kc] JSON parse failed:', err)
      return NextResponse.json(
        { success: false, error: 'LLM 返回的 JSON 解析失败', raw: response.content.substring(0, 500) },
        { status: 502 }
      )
    }

    // 校验 + 规范化
    const explanation = normalizeExplanation(parsed)
    if (!explanation) {
      return NextResponse.json(
        { success: false, error: 'LLM 返回数据不完整（缺少 summary 或 coreConcept）', raw: JSON.stringify(parsed).substring(0, 500) },
        { status: 502 }
      )
    }

    return NextResponse.json({
      success: true,
      audience,
      audienceLabel: cfg.label,
      audienceIcon: cfg.icon,
      explanation,
      model: response.model,
      usage: response.usage,
      durationMs: Date.now() - startTime,
    })
  } catch (err) {
    console.error('[explain-kc] error:', err)
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Internal server error',
      },
      { status: 500 }
    )
  }
}

// ============================================================================
// Prompt 构建
// ============================================================================

function buildExplainPrompt(kc: KnowledgeCard, cfg: AudienceConfig): ChatMessage[] {
  // D39 — Auto Translate: 用户开启时追加 locale 指令(覆盖原 "跟随 KC 语言" 规则)
  const autoTranslateDirective = buildAutoTranslateDirective()

  // v2.3.3 fix — 通过 PromptBuilder 注入 preset persona,让 General Tab 的 Preset 在 Explain 也生效
  const systemContent = `You are ResearchKit's Explain Agent. Your job: re-explain a Knowledge Card (KC) about a research paper for a specific audience.

# Target Audience
You are explaining to ${cfg.description}.

# Focus
${cfg.focus}

# Style
${cfg.style}

# Output Format
Return STRICT JSON only (no markdown, no comments):
{
  "summary": "One-sentence summary of the paper in this audience's language (≤ 150 chars)",
  "whyItMatters": "2-3 sentences explaining why this matters to THIS audience specifically (≤ 300 chars)",
  "coreConcept": "The core concept explained using an analogy or simple language THIS audience would understand (≤ 500 chars). Use concrete examples from their world.",
  "actionable": "One actionable insight the audience can take away (≤ 200 chars)",
  "questions": ["3 questions THIS audience should ask after reading this", "question 2", "question 3"],
  "tags": ["2-3 tags describing what this audience cares about here, e.g. '工程实现', '商业价值', '类比理解'"]
}

# Rules
- Match the audience's vocabulary: high school = analogies; engineer = code/systems; researcher = academic; PM = business.
- Questions must be audience-specific (don't ask generic questions).
- Be honest if the paper is too technical for the audience — say so in 'whyItMatters'.
- All text should be in the same language as the KC's title (English KC → English explanation; Chinese KC → Chinese explanation).${autoTranslateDirective}`

  const { preset } = getServerUserPreferences()
  const built = PromptBuilder.build({
    agent: 'Explain',
    system: systemContent,
    preset,
  })

  const user = `# Knowledge Card
${formatKCForExplain(kc)}

Now explain this paper for: ${cfg.label} (${cfg.description}).

Return the JSON as specified.`

  return [
    { role: 'system', content: built.content },
    { role: 'user', content: user },
  ]
}

function formatKCForExplain(kc: KnowledgeCard): string {
  const lines: string[] = []
  lines.push(`Title: ${kc.title}`)
  if (kc.authors && kc.authors.length > 0) {
    lines.push(`Authors: ${kc.authors.slice(0, 3).join(', ')}${kc.authors.length > 3 ? ' et al.' : ''}`)
  }
  if (kc.field) lines.push(`Field: ${kc.field}`)
  if (kc.year) lines.push(`Year: ${kc.year}`)
  if (kc.difficulty) lines.push(`Difficulty: ${kc.difficulty}`)

  if (kc.summary) lines.push(`\nSummary: ${kc.summary}`)
  if (kc.methodology) lines.push(`Methodology: ${kc.methodology}`)

  if (kc.innovation && kc.innovation.length > 0) {
    lines.push(`Key Contributions:`)
    kc.innovation.slice(0, 4).forEach(c => lines.push(`  - ${c}`))
  }
  if (kc.research_goals && kc.research_goals.length > 0) {
    lines.push(`Research Goals:`)
    kc.research_goals.slice(0, 3).forEach(g => lines.push(`  - ${g}`))
  }
  if (kc.results && kc.results.length > 0) {
    lines.push(`Results:`)
    kc.results.slice(0, 3).forEach(r => lines.push(`  - ${r}`))
  }
  if (kc.limitations && kc.limitations.length > 0) {
    lines.push(`Limitations:`)
    kc.limitations.slice(0, 2).forEach(l => lines.push(`  - ${l}`))
  }
  if (kc.applications && kc.applications.length > 0) {
    lines.push(`Applications:`)
    kc.applications.slice(0, 3).forEach(a => lines.push(`  - ${a}`))
  }
  if (kc.future_work && kc.future_work.length > 0) {
    lines.push(`Future Work:`)
    kc.future_work.slice(0, 2).forEach(f => lines.push(`  - ${f}`))
  }
  if (kc.key_terms && kc.key_terms.length > 0) {
    lines.push(`Key Terms:`)
    kc.key_terms.slice(0, 8).forEach(t => {
      lines.push(`  - ${t.term}: ${t.definition || 'N/A'}`)
    })
  }
  if (kc.takeaway) lines.push(`\nTakeaway: ${kc.takeaway}`)
  if (kc.why_it_matters) lines.push(`Why It Matters: ${kc.why_it_matters}`)

  return lines.join('\n')
}

// ============================================================================
// 结果校验 + 规范化
// ============================================================================

interface Explanation {
  summary: string
  whyItMatters: string
  coreConcept: string
  actionable: string
  questions: string[]
  tags: string[]
}

function normalizeExplanation(parsed: any): Explanation | null {
  if (!parsed) return null

  const summary = String(parsed.summary || '').trim()
  const coreConcept = String(parsed.coreConcept || '').trim()

  // 必须字段：summary + coreConcept
  if (!summary || !coreConcept) return null

  const whyItMatters = String(parsed.whyItMatters || '').trim().substring(0, 500)
  const actionable = String(parsed.actionable || '').trim().substring(0, 300)

  // questions — 必须是数组，至少 1 个
  let questions: string[] = []
  if (Array.isArray(parsed.questions)) {
    questions = parsed.questions
      .map((q: any) => String(q || '').trim())
      .filter((q: string) => q.length > 0)
      .slice(0, 5)
  }

  let tags: string[] = []
  if (Array.isArray(parsed.tags)) {
    tags = parsed.tags
      .map((t: any) => String(t || '').trim())
      .filter((t: string) => t.length > 0)
      .slice(0, 5)
  }

  return {
    summary: summary.substring(0, 300),
    whyItMatters,
    coreConcept: coreConcept.substring(0, 800),
    actionable,
    questions,
    tags,
  }
}

/**
 * Chat with Knowledge Card API — D10
 *
 * POST /api/research/chat-kc
 * Body: {
 *   kc: KnowledgeCard,                  // 当前知识卡
 *   question: string,                  // 用户追问
 *   history?: ChatMessage[],           // 已有的对话历史（不含本次 question）
 * }
 * Response: {
 *   success: true,
 *   answer: string,                    // LLM 回答（markdown）
 *   model: string,
 *   usage: { promptTokens, completionTokens, totalTokens },
 *   durationMs: number,
 * }
 *
 * 数据流：
 * 1. 接收当前 KC + 用户问题 + 已有对话历史
 * 2. 构建 system prompt（注入 KC 上下文）
 * 3. 拼接对话历史 + 新问题
 * 4. 单次 LLM 调用（不走 coordinator — 简单 chat 不需要 plan/execute/reflect）
 * 5. 返回 LLM 回答 + token 统计（不计入 page 级 Cost Dashboard，因为 Chat 是独立的交互）
 *
 * 设计原则：
 * - 流式响应（未来 v2.3 升级为 SSE streaming，让用户感知打字效果）
 * - 当前 v2.2 使用一次性返回（实现简单，且 deepseek/openai 等接口已足够快）
 * - 不持久化对话历史（前端 localStorage 自行管理，避免多用户场景冲突）
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerProvider } from '@/lib/server-provider'
import { setCurrentAgent } from '@/lib/usage-collector'
import type { ChatMessage } from '@/core/llm/provider'
import type { KnowledgeCard } from '@/types/knowledge'

export const runtime = 'nodejs'
export const maxDuration = 60

// ============================================================================
// 入口
// ============================================================================

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await req.json()
    const kc = body.kc as KnowledgeCard
    const question = String(body.question || '').trim()
    const history: ChatMessage[] = Array.isArray(body.history) ? body.history : []

    // 参数校验
    if (!kc || !kc.title) {
      return NextResponse.json(
        { success: false, error: '缺少 KnowledgeCard 或 title' },
        { status: 400 }
      )
    }
    if (!question) {
      return NextResponse.json(
        { success: false, error: '请输入问题' },
        { status: 400 }
      )
    }
    if (question.length > 2000) {
      return NextResponse.json(
        { success: false, error: '问题过长（最多 2000 字符）' },
        { status: 400 }
      )
    }
    // 限制历史长度，避免 prompt 过长
    const trimmedHistory = history.slice(-10)

    // 标记当前 Agent（让 usage-collector 知道本次 LLM 调用归属 Chat）
    setCurrentAgent('Chat')

    const provider = getServerProvider()

    // 构建 system + history + user
    const systemPrompt = buildChatSystemPrompt(kc)
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...trimmedHistory,
      { role: 'user', content: question },
    ]

    const response = await provider.chat(messages, {
      temperature: 0.4, // 略高于 JSON 模式，让回答更自然
      timeout: 30_000,
    })

    if (!response.content) {
      return NextResponse.json(
        { success: false, error: 'LLM 返回空内容' },
        { status: 502 }
      )
    }

    return NextResponse.json({
      success: true,
      answer: response.content,
      model: response.model,
      usage: response.usage,
      durationMs: Date.now() - startTime,
    })
  } catch (err) {
    console.error('[chat-kc] error:', err)
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

/**
 * 构建 Chat System Prompt — 注入 KC 上下文
 *
 * 设计原则：
 * - 简洁但完整：包含 title / authors / field / methodology / key concepts / limitations
 * - 不直接 dump KC JSON（用户可读性差，且浪费 token）
 * - 引导 LLM 回答问题时引用 KC 中的具体内容
 * - 当问题超出 KC 范围时，明确说明"KC 中未涉及"，但可补充常识性知识
 */
function buildChatSystemPrompt(kc: KnowledgeCard): string {
  const parts: string[] = []

  parts.push(`You are ResearchKit's Knowledge Card Assistant. You help users deeply understand a research paper by answering follow-up questions based on the Knowledge Card (KC) generated for that paper.`)

  parts.push(`\n# Knowledge Card Context\n\n${formatKCForChat(kc)}`)

  parts.push(`\n# Guidelines

- **Grounded in the KC**: Answer based primarily on the KC above. Quote specific fields (methodology, results, limitations) when relevant.
- **Be honest about gaps**: If the user asks about something not covered in the KC, say so explicitly (e.g., "The Knowledge Card doesn't include details about X."). You may then provide general background if it helps the user.
- **Adapt to the question's level**: If the user asks a simple question, give a simple answer. If they ask a deep question, give a detailed one.
- **Use markdown** for readability: bullet lists, **bold** for key terms, \`inline code\` for technical terms, and short paragraphs.
- **Use the KC's language**: If the KC is in English, answer in English. If Chinese, answer in Chinese. Match the user's question language when in doubt.
- **Stay focused**: Don't re-summarize the whole paper. Answer the specific question asked.
- **Suggest follow-ups**: At the end of complex answers, optionally suggest 1-2 related questions the user might want to ask next.`)

  return parts.join('\n')
}

/**
 * 压缩 KC 为 chat 友好的 markdown
 */
function formatKCForChat(kc: KnowledgeCard): string {
  const lines: string[] = []
  lines.push(`## ${kc.title}`)
  if (kc.authors && kc.authors.length > 0) {
    lines.push(`**Authors**: ${kc.authors.slice(0, 5).join(', ')}${kc.authors.length > 5 ? ' et al.' : ''}`)
  }
  if (kc.field) lines.push(`**Field**: ${kc.field}`)
  if (kc.year) lines.push(`**Year**: ${kc.year}`)
  if (kc.difficulty) lines.push(`**Difficulty**: ${kc.difficulty}`)
  if (kc.reading_time_min) lines.push(`**Reading Time**: ${kc.reading_time_min} min`)

  if (kc.summary) {
    lines.push(`\n### Summary\n${kc.summary}`)
  }

  if (kc.methodology) {
    lines.push(`\n### Methodology\n${kc.methodology}`)
  }

  if (kc.research_goals && kc.research_goals.length > 0) {
    lines.push(`\n### Research Goals`)
    kc.research_goals.forEach((g, i) => lines.push(`${i + 1}. ${g}`))
  }

  if (kc.innovation && kc.innovation.length > 0) {
    lines.push(`\n### Key Contributions / Innovations`)
    kc.innovation.forEach((c, i) => lines.push(`${i + 1}. ${c}`))
  }

  if (kc.results && kc.results.length > 0) {
    lines.push(`\n### Results`)
    kc.results.forEach((r, i) => lines.push(`${i + 1}. ${r}`))
  }

  if (kc.limitations && kc.limitations.length > 0) {
    lines.push(`\n### Limitations`)
    kc.limitations.forEach((l, i) => lines.push(`${i + 1}. ${l}`))
  }

  if (kc.future_work && kc.future_work.length > 0) {
    lines.push(`\n### Future Work`)
    kc.future_work.forEach((f, i) => lines.push(`${i + 1}. ${f}`))
  }

  if (kc.applications && kc.applications.length > 0) {
    lines.push(`\n### Applications`)
    kc.applications.forEach((a, i) => lines.push(`${i + 1}. ${a}`))
  }

  if (kc.key_terms && kc.key_terms.length > 0) {
    lines.push(`\n### Key Terms`)
    kc.key_terms.slice(0, 12).forEach((t) => {
      const importance = t.importance ? ` ★${t.importance}` : ''
      const category = t.category ? ` [${t.category}]` : ''
      lines.push(`- **${t.term}**${category}${importance}: ${t.definition || 'N/A'}`)
    })
  }

  if (kc.takeaway) lines.push(`\n### Takeaway\n${kc.takeaway}`)
  if (kc.why_it_matters) lines.push(`\n### Why It Matters\n${kc.why_it_matters}`)

  if (kc.tags && kc.tags.length > 0) {
    lines.push(`\n**Tags**: ${kc.tags.map(t => `#${t}`).join(' ')}`)
  }

  return lines.join('\n')
}

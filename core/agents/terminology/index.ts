/**
 * Terminology Agent — 提取关键术语 + 定义 + 分类 + 重要性 + 前置依赖
 *
 * 升级版（支撑 Knowledge Graph / Mindmap）：
 * - importance (1-5)：术语在论文中的核心程度（5 = 核心创新概念）
 * - prerequisite (string[])：理解该术语所需的前置术语（直接指向其他 term，构建依赖图）
 * - 与 Analyzer 协作：避免重复提取 Analyzer 已抽出的方法学
 *
 * Mindmap 渲染时：
 * - importance 决定节点大小
 * - prerequisite 决定连线（term → 依赖的 term）
 */

import OpenAI from 'openai'
import { Agent, AgentMessage, createMessage } from '@/lib/mcp'
import { detectLocale, Locale, buildLanguageDirective } from '@/lib/locale'
import { buildTerminologyPrompt } from '@/prompts/terminology'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: (process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1').trim(),
})

const LLM_MODEL = process.env.LLM_MODEL?.trim() || 'deepseek-v4-flash'

export interface TerminologyTerm {
  term: string
  definition: string
  category: 'concept' | 'method' | 'tool' | 'metric'
  importance: 1 | 2 | 3 | 4 | 5       // 升级版新增：1=边缘，5=核心
  prerequisite: string[]               // 升级版新增：理解该术语所需的前置术语（指向其他 term 名）
}

export interface TerminologyOutput {
  terms: TerminologyTerm[]
}

export const TerminologyAgent: Agent = {
  name: 'Terminology',
  description: '提取关键术语，输出定义/分类/重要性/前置依赖，支持知识图谱构建',
  capabilities: [
    {
      name: 'extractTerms',
      description: '提取术语 + importance + prerequisite，构建术语依赖图',
      inputs: ['text', 'analyzerMethodology'],
      outputs: ['terms'],
    },
  ],

  async handleMessage(message: AgentMessage): Promise<AgentMessage> {
    if (message.type !== 'task') {
      return createMessage('error', 'Terminology', message.from, { error: '只处理 task 类型消息' })
    }

    const { content, analyzerMethodology, language_directive } = message.payload

    // Locale 检测（升级版：从 coordinator 传入或本地检测）
    const sourceLocale: Locale = message.payload.source_locale || detectLocale(content)
    const targetLocale: Locale = message.payload.target_locale || sourceLocale
    const finalLanguageDirective = language_directive || buildLanguageDirective(sourceLocale, targetLocale)

    const response = await openai.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        {
          role: 'system',
          content: buildTerminologyPrompt({
            finalLanguageDirective,
            analyzerMethodology,
          }),
        },
        {
          role: 'user',
          content: content.substring(0, 20000),
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
      console.error('[Terminology] LLM 返回非 JSON:', raw.substring(0, 500))
      throw new Error('Terminology LLM 返回非 JSON 格式（可能限流或返回错误文本）')
    }

    // 规范化输出 — 确保 category 合法、importance 在 1-5、prerequisite 是数组
    const validCategories = new Set(['concept', 'method', 'tool', 'metric'])
    const rawTerms: any[] = parsed.terms || []

    const terms: TerminologyTerm[] = rawTerms
      .filter(t => t && typeof t.term === 'string' && t.term.trim())
      .map(t => {
        const category = validCategories.has(t.category) ? t.category : 'concept'
        const importanceRaw = Number(t.importance)
        const importance: 1 | 2 | 3 | 4 | 5 = (
          isNaN(importanceRaw) ? 3 :
          importanceRaw < 1 ? 1 :
          importanceRaw > 5 ? 5 :
          Math.round(importanceRaw)
        ) as 1 | 2 | 3 | 4 | 5

        const prerequisite: string[] = Array.isArray(t.prerequisite)
          ? t.prerequisite.filter((p: any) => typeof p === 'string' && p.trim())
          : []

        return {
          term: String(t.term).trim(),
          definition: String(t.definition || '').trim(),
          category,
          importance,
          prerequisite,
        }
      })

    // 排序：importance 高的在前
    terms.sort((a, b) => b.importance - a.importance)

    const output: TerminologyOutput = { terms }

    return createMessage('result', 'Terminology', message.from, output, message.id)
  },

  getCapabilities() {
    return this.capabilities
  },
}

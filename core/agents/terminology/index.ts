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

import { AgentMessage, createMessage, AgentCapability } from '@/lib/mcp'
import { detectLocale, Locale, buildLanguageDirective } from '@/lib/locale'
import { buildTerminologyPrompt } from '@/prompts/terminology'
import { getServerProvider } from '@/lib/server-provider'
import { PromptBuilder } from '@/core/prompt'
import { getServerProjectExtension } from '@/lib/server-prompt-extensions'
import { getServerUserPreferences, getEffectiveOutputLocale } from '@/lib/server-user-preferences'
import type { AgentInterface, AgentContext, AgentResult } from '@/types'

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

/**
 * Terminology Agent — class 化（v2.0）
 */
export class TerminologyAgent implements AgentInterface {
  name = 'Terminology' as const
  description = '提取关键术语，输出定义/分类/重要性/前置依赖，支持知识图谱构建'
  capabilities: AgentCapability[] = [
    {
      name: 'extractTerms',
      description: '提取术语 + importance + prerequisite，构建术语依赖图',
      inputs: ['text', 'analyzerMethodology'],
      outputs: ['terms'],
    },
  ]

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const start = Date.now()
    try {
      const payload = {
        content: ctx.document.content,
        source_locale: ctx.options.sourceLocale,
        target_locale: ctx.options.locale,
        language_directive: ctx.options.languageDirective,
        analyzerMethodology: ctx.previous.analyzer?.methodology || '',
      }
      const data = await this._run(payload)
      return { success: true, data, durationMs: Date.now() - start }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Terminology failed'
      return { success: false, data: { error: msg }, durationMs: Date.now() - start, error: msg }
    }
  }

  async handleMessage(message: AgentMessage): Promise<AgentMessage> {
    if (message.type !== 'task') {
      return createMessage('error', 'Terminology', message.from, { error: '只处理 task 类型消息' })
    }
    try {
      const output = await this._run(message.payload)
      return createMessage('result', 'Terminology', message.from, output, message.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Terminology failed'
      return createMessage('error', 'Terminology', message.from, { error: msg }, message.id)
    }
  }

  private async _run(payload: any): Promise<TerminologyOutput> {
    const { content, analyzerMethodology, language_directive } = payload

    const sourceLocale: Locale = payload.source_locale || detectLocale(content)
    const targetLocale: Locale = payload.target_locale || getEffectiveOutputLocale(sourceLocale)
    const finalLanguageDirective = language_directive || buildLanguageDirective(sourceLocale, targetLocale)

    const provider = getServerProvider()
    const systemPrompt = buildTerminologyPrompt({
      finalLanguageDirective,
      analyzerMethodology,
    })
    const prefs = getServerUserPreferences()
    const built = PromptBuilder.build({
      agent: 'Terminology',
      system: systemPrompt,
      project: getServerProjectExtension('Terminology'),
      preset: prefs.preset,
    })
    const response = await provider.chat(
      [
        {
          role: 'system',
          content: built.content,
        },
        {
          role: 'user',
          content: content.substring(0, 20000),
        },
      ],
      {
        responseFormat: 'json_object',
        temperature: 0.3,
      }
    )

    const raw = response.content || '{}'
    let parsed: any
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      console.error('[Terminology] LLM 返回非 JSON:', raw.substring(0, 500))
      throw new Error('Terminology LLM 返回非 JSON 格式（可能限流或返回错误文本）')
    }

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

    terms.sort((a, b) => b.importance - a.importance)

    const output: TerminologyOutput = { terms }
    return output
  }

  getCapabilities(): AgentCapability[] {
    return this.capabilities
  }
}

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

import { AgentMessage, createMessage, AgentCapability } from '@/lib/mcp'
import type { ReaderOutput } from '@/lib/agents/reader'
import { buildAnalyzerPrompt } from '@/prompts/analyzer'
import { getServerProvider } from '@/lib/server-provider'
import { PromptBuilder } from '@/core/prompt'
import { getServerProjectExtension } from '@/lib/server-prompt-extensions'
import { getServerUserPreferences } from '@/lib/server-user-preferences'
import type { AgentInterface, AgentContext, AgentResult } from '@/types'

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

/**
 * Analyzer Agent — class 化（v2.0）
 */
export class AnalyzerAgent implements AgentInterface {
  name = 'Analyzer' as const
  description = '深度分析论文，按 Planner 决定的 schema 输出结构化研究档案'
  capabilities: AgentCapability[] = [
    {
      name: 'analyze',
      description: '按 required_schema 提取字段，未在 schema 中的字段不返回',
      inputs: ['text', 'readerOutput', 'required_schema'],
      outputs: ['researchGoals', 'innovation', 'methodology', 'experiments', 'results', 'limitations', 'futureWork', 'applications', 'datasets', 'authors', 'field', 'year', 'structure'],
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
        readerOutput: ctx.previous.reader || null,
        required_schema: ctx.workflow.requiredSchema,
        input_type: ctx.workflow.inputType,
        prompt_patch: ctx.promptPatch,
      }
      const data = await this._run(payload)
      return { success: true, data, durationMs: Date.now() - start }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Analyzer failed'
      return { success: false, data: { error: msg }, durationMs: Date.now() - start, error: msg }
    }
  }

  async handleMessage(message: AgentMessage): Promise<AgentMessage> {
    if (message.type !== 'task') {
      return createMessage('error', 'Analyzer', message.from, { error: '只处理 task 类型消息' })
    }
    try {
      const output = await this._run(message.payload)
      return createMessage('result', 'Analyzer', message.from, output, message.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Analyzer failed'
      return createMessage('error', 'Analyzer', message.from, { error: msg }, message.id)
    }
  }

  private async _run(payload: any): Promise<AnalyzerOutput> {
    const { content, readerOutput, required_schema, input_type, prompt_patch, language_directive } = payload

    // 决定 schema：Planner 传入的优先，否则按 input_type 选默认，再不行全部字段
    let schema: AnalyzerField[] = (Array.isArray(required_schema) && required_schema.length > 0)
      ? required_schema
      : (input_type ? DEFAULT_SCHEMA_BY_INPUT_TYPE[input_type] : undefined) || DEFAULT_SCHEMA_BY_INPUT_TYPE.unknown

    // 升级版：如果有 prompt_patch（Replan 阶段的补丁），调整 schema
    let extraInstruction = ''
    if (prompt_patch) {
      const focus: string[] = prompt_patch.focus_fields || []
      const ignore: string[] = prompt_patch.ignore_fields || []
      extraInstruction = prompt_patch.extra_instruction || ''

      schema = schema.filter(f => !ignore.includes(f))
      for (const f of focus) {
        if (!schema.includes(f as AnalyzerField)) {
          schema.push(f as AnalyzerField)
        }
      }
    }

    if (schema.length === 0) {
      schema = DEFAULT_SCHEMA_BY_INPUT_TYPE.unknown
    }

    const provider = getServerProvider()
    const systemPrompt = buildAnalyzerPrompt({
      language_directive,
      schema,
      extraInstruction,
      prompt_patch,
    })
    const prefs = getServerUserPreferences()
    const built = PromptBuilder.build({
      agent: 'Analyzer',
      system: systemPrompt,
      project: getServerProjectExtension('Analyzer'),
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
          content: `Reader takeaway (use as context, don't repeat):
${readerOutput?.takeaway || readerOutput?.summary || 'N/A'}

Original text:
${content.substring(0, 20000)}`,
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
      console.error('[Analyzer] LLM 返回非 JSON:', raw.substring(0, 500))
      throw new Error('Analyzer LLM 返回非 JSON 格式（可能限流或返回错误文本）')
    }

    const getArray = (f: AnalyzerField): string[] => schema.includes(f) ? (parsed[f] || []) : []
    const getString = (f: AnalyzerField): string => schema.includes(f) ? (parsed[f] || '') : ''

    const output: AnalyzerOutput = {
      coreArguments: getArray('innovation'),
      actionableTakeaways: getArray('applications'),
      methodology: getString('methodology'),
      limitations: getArray('limitations'),
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

    return output
  }

  getCapabilities(): AgentCapability[] {
    return this.capabilities
  }
}

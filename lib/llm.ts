/**
 * OpenAI/DeepSeek 兼容 LLM 调用封装
 *
 * 升级版：KnowledgeCard 接口与 multi-agent 输出对齐
 * 旧 endpoint (/api/research/knowledge-card) 现在也输出完整研究 schema
 */

import OpenAI from 'openai'
import { KNOWLEDGE_CARD_SYSTEM_PROMPT, KNOWLEDGE_CARD_USER_PROMPT } from './prompts'

// 初始化 LLM 客户端（支持 OpenAI 和 DeepSeek，通过环境变量切换）
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  // DeepSeek 用户：在 .env.local 中设置 OPENAI_BASE_URL=https://api.deepseek.com/v1
  baseURL: (process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1').trim(),
})

// 模型名称（DeepSeek 最新模型：deepseek-v4-flash / deepseek-v4-pro）
const LLM_MODEL = process.env.LLM_MODEL?.trim() || 'deepseek-v4-flash'

export interface KnowledgeCard {
  // 基础
  title: string
  authors: string[]
  field: string
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced'
  year?: number

  // 核心
  summary: string
  research_goals: string[]
  innovation: string[]
  methodology: string
  experiments: string[]
  results: string[]
  limitations: string[]
  future_work: string[]

  // 术语
  key_terms: Array<{
    term: string
    definition: string
    category?: string
  }>

  // 应用 & 关联
  applications: string[]
  datasets: string[]

  // 兼容旧字段（由 LLM 同时输出）
  core_arguments: string[]
  actionable_takeaways: string[]
  references: string[]

  // 元数据
  tags: string[]
}

export interface GenerateKnowledgeCardOptions {
  content: string
  language?: 'zh' | 'en'
  detailLevel?: 'brief' | 'standard' | 'detailed'
}

/**
 * 调用 LLM 生成结构化知识卡（完整研究 schema）
 */
export async function generateKnowledgeCard(
  options: GenerateKnowledgeCardOptions
): Promise<KnowledgeCard> {
  const { content, language = 'zh', detailLevel = 'standard' } = options

  // 根据 detail_level 调整 max_tokens
  const maxTokensMap = {
    brief: 1200,
    standard: 2500,
    detailed: 4000,
  }

  try {
    const response = await openai.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        {
          role: 'system',
          content: KNOWLEDGE_CARD_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: KNOWLEDGE_CARD_USER_PROMPT(content, language),
        },
      ],
      max_tokens: maxTokensMap[detailLevel],
      temperature: 0.3, // 低温度保证输出稳定
      response_format: { type: 'json_object' },
    })

    const rawContent = response.choices[0].message.content
    if (!rawContent) {
      throw new Error('LLM 返回内容为空')
    }

    // 解析 JSON
    const parsed = JSON.parse(rawContent)

    // 统一化为完整 schema（向后兼容缺字段）
    const knowledgeCard: KnowledgeCard = {
      title: parsed.title || 'Untitled',
      authors: parsed.authors || [],
      field: parsed.field || '',
      difficulty: parsed.difficulty || 'Intermediate',
      year: parsed.year || undefined,

      summary: parsed.summary || '',
      research_goals: parsed.research_goals || [],
      innovation: parsed.innovation || parsed.core_arguments || [],
      methodology: parsed.methodology || '',
      experiments: parsed.experiments || [],
      results: parsed.results || [],
      limitations: parsed.limitations || [],
      future_work: parsed.future_work || [],

      key_terms: (parsed.key_terms || []).map((t: any) => ({
        term: t.term || '',
        definition: t.definition || '',
        category: t.category,
      })),

      applications: parsed.applications || parsed.actionable_takeaways || [],
      datasets: parsed.datasets || [],

      core_arguments: parsed.core_arguments || parsed.innovation || [],
      actionable_takeaways: parsed.actionable_takeaways || parsed.applications || [],
      references: parsed.references || [],

      tags: ['researchkit', ...(parsed.tags || [])],
    }

    // 基础验证
    if (!knowledgeCard.title) {
      throw new Error('返回的知识卡格式不正确：缺少 title')
    }

    return knowledgeCard
  } catch (error) {
    console.error('LLM 调用失败:', error)
    throw new Error(`生成知识卡失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}

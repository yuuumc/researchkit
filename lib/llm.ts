/**
 * OpenAI/DeepSeek 兼容 LLM 调用封装
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
  title: string
  core_arguments: string[]
  key_terms: Array<{
    term: string
    definition: string
  }>
  methodology: string
  actionable_takeaways: string[]
  references: string[]
}

export interface GenerateKnowledgeCardOptions {
  content: string
  language?: 'zh' | 'en'
  detailLevel?: 'brief' | 'standard' | 'detailed'
}

/**
 * 调用 LLM 生成结构化知识卡
 */
export async function generateKnowledgeCard(
  options: GenerateKnowledgeCardOptions
): Promise<KnowledgeCard> {
  const { content, language = 'zh', detailLevel = 'standard' } = options

  // 根据 detail_level 调整 max_tokens
  const maxTokensMap = {
    brief: 1000,
    standard: 1500,
    detailed: 2500,
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
    const knowledgeCard: KnowledgeCard = JSON.parse(rawContent)

    // 基础验证
    if (!knowledgeCard.title || !Array.isArray(knowledgeCard.core_arguments)) {
      throw new Error('返回的知识卡格式不正确')
    }

    return knowledgeCard
  } catch (error) {
    console.error('LLM 调用失败:', error)
    throw new Error(`生成知识卡失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}
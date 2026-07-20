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
          content: `You are the Terminology Agent — building a knowledge graph of key terms in a research pipeline.

Extract the most important domain-specific terms and DEFINE them with technical precision.
Your audience is a competent researcher entering this field, NOT a layperson.

${finalLanguageDirective}

## Categories
- concept: an abstract idea or theoretical notion (e.g., "Attention", "Embedding space")
- method: a technique or algorithmic procedure (e.g., "Multi-head attention", "Backpropagation")
- tool: a concrete framework/library/system (e.g., "PyTorch", "BERT")
- metric: a quantitative measure (e.g., "BLEU", "F1 score", "Perplexity")

## Term Extraction Rules
- Extract terms EXACTLY as they appear in the paper (don't translate, don't simplify, don't paraphrase).
- For English papers, prefer the canonical English term even if the user's language is different.
- For Chinese papers, use the Chinese term as it appears (e.g., "注意力机制", not "Attention Mechanism").
- DO extract compound terms (e.g., "Scaled dot-product attention" is one term, not three).
- DO extract named systems/models/datasets (e.g., "BERT", "GPT-3", "WMT 2014").
- DON'T extract single common words (e.g., "model", "training", "data") unless they have a specific technical meaning here.
- Each term should be NON-TRIVIAL — a reader entering the field would benefit from knowing it.

## Importance Scale
5 = The paper's core contribution or central concept (must appear in title or abstract)
4 = Key enabling concept that the contribution builds on
3 = Important supporting concept
2 = Mentioned but not central
1 = Peripheral / background context

## Prerequisite Rules
- prerequisite = list of OTHER term names (must exist in your output) that a reader should understand FIRST
- This forms a DAG (directed acyclic graph) — do NOT create circular dependencies
- If a term has no prerequisite, return []
- Example: "Multi-head attention" → prerequisite: ["Self-attention", "Scaled dot-product attention"]

## Deduplication
${analyzerMethodology ? `- Analyzer already extracted this methodology: "${analyzerMethodology}". Don't extract it as a single term — instead extract the BUILDING BLOCKS of the methodology (e.g., for "Multi-head attention + position-wise FFN", extract "Multi-head attention", "Positional encoding", "Feed-forward network" separately).` : '- Focus on individual concepts, not the whole method.'}
- Avoid near-duplicates (e.g., don't extract both "Self-attention" and "Scaled dot-product attention" if they refer to the same thing — pick the canonical name).

## Output Contract
Respond ONLY in JSON with this exact shape:
{
  "terms": [
    {
      "term": "string (canonical name, preserve original language)",
      "definition": "one-sentence definition with technical precision (in target language)",
      "category": "concept | method | tool | metric",
      "importance": 1-5,
      "prerequisite": ["other_term_name", ...]
    }
  ]
}

Extract 5-10 most important terms.
Prioritize: importance 5 first, then 4, then 3. Don't pad with importance-1 terms just to reach 10.
If the paper has fewer than 5 important terms, return fewer — don't pad.

## Structural Example (for STRUCTURE only — your output language follows the language directive above)
Input: Transformer paper (Attention Is All You Need)
Output:
{
  "terms": [
    {"term": "Self-attention", "definition": "An attention mechanism relating different positions of a single sequence to compute its representation.", "category": "concept", "importance": 5, "prerequisite": ["Attention"]},
    {"term": "Multi-head attention", "definition": "Running several attention operations in parallel and projecting their concatenated outputs.", "category": "method", "importance": 5, "prerequisite": ["Self-attention"]},
    {"term": "Scaled dot-product attention", "definition": "Attention computed as softmax(QK^T/√d_k)V.", "category": "method", "importance": 4, "prerequisite": ["Self-attention"]},
    {"term": "Positional encoding", "definition": "Vector added to embeddings to inject positional information, since attention is permutation-invariant.", "category": "concept", "importance": 4, "prerequisite": ["Embedding"]},
    {"term": "BLEU", "definition": "A metric measuring translation quality by n-gram overlap with reference translations.", "category": "metric", "importance": 3, "prerequisite": []},
    {"term": "WMT 2014", "definition": "A standard machine translation benchmark dataset for English-German and English-French.", "category": "tool", "importance": 2, "prerequisite": []}
  ]
}

Note: This example is in English for STRUCTURE demonstration. If your input is in another language, your term/definition fields MUST follow the target language (per the language directive above), but the term names themselves should stay in their canonical form (e.g., a Chinese paper discussing Transformer should still use "Transformer" as the term name, not "变压器").`,
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

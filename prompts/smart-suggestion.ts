/**
 * D30 Smart Suggestion v2 — LLM 判断 prompts
 *
 * 让 LLM 判断当前 KC 与历史 KC 列表中最相关的一篇，并生成 reason
 *
 * 设计：
 * - 输入：currentKC + history KC 摘要（最多 5 篇，避免 prompt 过长）
 * - 输出：JSON { bestMatchId, score, reasons, relationType }
 *   - bestMatchId 为 null 表示无相关论文
 *   - score 0-100（LLM 主观打分）
 *   - reasons 中文短句（1-2 条）
 */

export interface SmartSuggestionPromptContext {
  languageDirective?: string
}

export function buildSmartSuggestionPrompt(ctx: SmartSuggestionPromptContext): string {
  const lang = ctx.languageDirective || 'Respond in Chinese (Simplified).'
  return `You are an academic advisor. Given the current paper and a list of previously read papers, identify the MOST related paper (if any) and explain why.

${lang}

## Decision Rules
- Return bestMatchId = null if no paper is clearly related (score < 30)
- Prefer strong signals: same research field, shared key terms, shared authors, same methodology
- Weak signals (just shared title word): only if no stronger match exists
- Score 0-100 reflecting confidence of the relation
- 1-2 reasons in Chinese, concise and specific (avoid generic "related topic")

## Relation Type
- "same_field": both papers in the same research field (strongest)
- "shared_authors": share >=1 author
- "shared_terms": share >=1 significant key term
- "related": topical connection but none of the above
- "none": no meaningful relation

## Output Format (JSON only, no other text)

Example output:

{"bestMatchId":"<id from history>","score":85,"reasons":["Same field: NLP"],"relationType":"same_field"}

Or when no match:

{"bestMatchId":null,"score":0,"reasons":[],"relationType":"none"}
`
}

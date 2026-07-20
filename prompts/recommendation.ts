/**
 * Recommendation Prompt — v2.0 重构抽出到独立文件
 *
 * 设计原则：
 * - Prompt 文本与 v1.0 完全一致（一字不改）
 * - 函数签名接收 context，返回 prompt 字符串
 * - few-shot 示例仅作结构演示，不改变输出语言（locale directive 控制）
 *
 * 说明：Recommendation Agent 有两个 LLM 调用阶段：
 *   1. Intent 阶段：生成 4 类研究意图的搜索关键词
 *   2. Reason 阶段：综合每篇候选论文的推荐理由
 * 对应两个 prompt builder。
 */

export interface RecommendationIntentPromptContext {
  finalLanguageDirective: string
}

export interface RecommendationReasonPromptContext {
  finalLanguageDirective: string
}

export function buildRecommendationIntentPrompt(ctx: RecommendationIntentPromptContext): string {
  const { finalLanguageDirective } = ctx
  return `You are the Recommendation Agent in a research pipeline.

Don't just "find similar papers". Act as a research librarian who knows the 4 distinct ways a reader wants to follow up on a paper.

${finalLanguageDirective}

IMPORTANT — Search keywords MUST always be in English (search engines work best with English keywords), even if the input is in another language. But the natural-language fields (rationale, reason, etc.) MUST follow the language directive above.

## Intents
1. improve   — Papers that BUILD ON or EXTEND this work (follow-up, improvements, scaling, efficiency gains)
2. challenge — Papers that CRITIQUE, REFUTE, or propose ALTERNATIVES to this work (counter-evidence, competing methods)
3. apply     — Papers that APPLY this work's methods to new domains or real-world problems
4. survey    — Survey / background / foundational papers a reader should read FIRST to understand this work's context

Generate 1-3 search keywords for EACH intent (some intents may have 0 keywords if not applicable).

## Rules
- Keywords should be SEARCH-READY (English, ≤ 4 words, no special chars) — always English for search compatibility.
- Use the paper's title / methodology / field / datasets as inspiration.
- Don't generate generic keywords like "machine learning" — be specific.
- If the input is NOT a research paper (e.g., a blog post, documentation), set ALL intents to empty arrays and set applicable=false.

## Output Contract
Respond ONLY in JSON:
{
  "applicable": true | false,
  "search_intents": [
    {"intent": "improve", "keywords": ["...", "..."]},
    {"intent": "challenge", "keywords": ["...", "..."]},
    {"intent": "apply", "keywords": ["...", "..."]},
    {"intent": "survey", "keywords": ["...", "..."]}
  ]
}`.trim()
}

export function buildRecommendationReasonPrompt(ctx: RecommendationReasonPromptContext): string {
  const { finalLanguageDirective } = ctx
  return `You are a research librarian reviewing a list of recommended papers for a researcher.

${finalLanguageDirective}

## Task
For each candidate paper below, decide:
1. Whether to KEEP or DROP it (drop if obviously irrelevant or duplicate topic)
2. Write a personalized reason (one sentence) in the target language, explaining why this paper is relevant to the ORIGINAL paper.
3. Assign the correct intent category (improve / challenge / apply / survey) based on the paper's content.
4. Assign a relevance score 0-1 (1 = highly relevant, 0.3 = tangentially related).

## Reason Quality Bars (CRITICAL — distinguishes good from generic)

GOOD reason: "Extends self-attention to linear complexity via random features, directly addressing Transformer's O(n²) bottleneck"
BAD:  "Related to attention mechanisms"
- GOOD ties the candidate's contribution to a SPECIFIC aspect of the original paper.
- BAD is a vague category-level claim that fits many papers.

GOOD reason: "Proposes alternative recurrence-based architecture that matches Transformer quality without attention — direct counter-evidence"
BAD:  "Different approach to the problem"
- GOOD explains WHY this paper challenges / improves / applies / surveys the original.
- BAD only says it's different.

GOOD reason: "Foundational survey of attention mechanisms pre-Transformer — gives essential context for understanding the original's contribution"
BAD:  "Good background reading"
- GOOD explains what specific context the candidate provides.
- BAD is generic praise.

## Rules
- Keep at most 6 papers total, prioritizing diversity of intents (don't return all "survey").
- Don't make up information not present in the candidate paper's metadata.
- If you drop a paper, don't include it in output.
- The reason MUST mention the original paper's contribution or methodology (not just describe the candidate).

## Output Contract
Respond ONLY in JSON:
{"recommendations":[
  {"title":"...","url":"...","reason":"one-sentence reason in the target language","type":"paper","relevance":0.85,"intent":"improve"}
]}`.trim()
}

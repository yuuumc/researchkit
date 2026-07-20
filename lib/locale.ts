/**
 * Locale detection and language helpers — 升级版
 *
 * 核心理念：两阶段架构
 * 1. 理解阶段（Reasoning）：LLM 始终以源语言推理，避免翻译丢失细节
 * 2. 生成阶段（Rendering）：按 locale 输出最终文本
 *
 * Locale 比 language 更精细（zh-CN / en-US / ja-JP），未来可扩展。
 */

export type Locale = 'zh-CN' | 'en-US' | 'ja-JP' | 'ko-KR' | 'fr-FR' | 'de-DE' | 'es-ES' | 'other'

/**
 * 程序化检测输入 locale — 不依赖 LLM
 * 用 Unicode 字符分布判断
 */
export function detectLocale(content: string): Locale {
  if (!content) return 'en-US'
  const sample = content.substring(0, 2000)
  const chineseChars = (sample.match(/[\u4e00-\u9fff]/g) || []).length
  const japaneseHiragana = (sample.match(/[\u3040-\u309f]/g) || []).length
  const japaneseKatakana = (sample.match(/[\u30a0-\u30ff]/g) || []).length
  const koreanChars = (sample.match(/[\uac00-\ud7af]/g) || []).length
  const latinLetters = (sample.match(/[a-zA-Z]/g) || []).length

  // 日文优先（hiragana/katakana 是日语独有）
  if (japaneseHiragana + japaneseKatakana > 5) return 'ja-JP'
  // 韩文
  if (koreanChars > latinLetters * 0.3) return 'ko-KR'
  // 中文：中文字符比例 > 20% 且多于拉丁字母
  if (chineseChars > latinLetters * 0.3 && chineseChars > 5) return 'zh-CN'
  // 英文 / 拉丁语系：默认 en-US
  if (latinLetters > 10) return 'en-US'
  return 'other'
}

/**
 * 把 locale 转成人类可读的语言名称（英文 + 本地语言）
 * 用于 LLM prompt 中明确指示输出语言
 */
export function localeDisplayName(locale: Locale): string {
  const map: Record<Locale, string> = {
    'zh-CN': 'Chinese (简体中文)',
    'en-US': 'English (US)',
    'ja-JP': 'Japanese (日本語)',
    'ko-KR': 'Korean (한국어)',
    'fr-FR': 'French (Français)',
    'de-DE': 'German (Deutsch)',
    'es-ES': 'Spanish (Español)',
    'other': 'English',
  }
  return map[locale] || 'English'
}

/**
 * 简化的 language code（用于 KnowledgeCard.language 字段，向后兼容）
 */
export function localeToLanguage(locale: Locale): 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es' | 'other' {
  const map: Record<Locale, 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es' | 'other'> = {
    'zh-CN': 'zh',
    'en-US': 'en',
    'ja-JP': 'ja',
    'ko-KR': 'ko',
    'fr-FR': 'fr',
    'de-DE': 'de',
    'es-ES': 'es',
    'other': 'other',
  }
  return map[locale]
}

/**
 * 生成两阶段语言指示 — 给所有 Agent 用
 *
 * 阶段 1（理解）：始终以源语言推理，不翻译
 * 阶段 2（生成）：按 target locale 输出
 *
 * 默认 target = source（避免翻译导致的信息丢失）
 */
export function buildLanguageDirective(sourceLocale: Locale, targetLocale: Locale = sourceLocale): string {
  const sourceName = localeDisplayName(sourceLocale)
  const targetName = localeDisplayName(targetLocale)

  // 源语言 = 目标语言：单一语言模式，最简单
  if (sourceLocale === targetLocale) {
    return `## Output Language

Locale: ${targetLocale}
Language: ${targetName}

Rules:
1. Think and reason in the SAME language as the input (${sourceName}).
2. Output ALL fields in ${targetName}.
3. Keep technical terms in their original form (do NOT translate model names like "Transformer", "BERT", "GPT").
4. Do NOT translate dataset names (keep "WMT 2014", "ImageNet" as-is).
5. Do NOT translate algorithm names (keep "scaled dot-product attention" as-is).
6. Do NOT mix languages in a single field.
7. Any few-shot examples in the prompt below are for STRUCTURE demonstration only — they do NOT change your output language. Always output in ${targetName}.`
  }

  // 源语言 ≠ 目标语言：两阶段模式
  return `## Output Language

Source language: ${sourceName}
Target locale: ${targetLocale}
Target language: ${targetName}

## Two-Phase Processing (CRITICAL)

### Phase 1 — Understanding (INTERNAL, not in output)
Think and reason in the SOURCE language (${sourceName}).
Extract structured information from the input.
Do NOT translate during this phase — translation loses details.

### Phase 2 — Rendering (in your JSON output)
Output all natural-language fields (reasoning, takeaway, definitions, etc.) in the TARGET language (${targetName}).
Keep technical terms in their original source-language form:
- Model names: keep as-is (Transformer → Transformer, NOT 变压器)
- Dataset names: keep as-is (WMT 2014 → WMT 2014, NOT 世界机器翻译大会)
- Algorithm names: keep as-is (scaled dot-product attention → scaled dot-product attention)
- Field/domain names: translate when there's a standard equivalent (NLP → 自然语言处理)

If unsure whether a term should be translated, keep it in the original language.

NOTE: Any few-shot examples in the prompt below are for STRUCTURE demonstration only — they do NOT change your output language. Always output natural-language fields in ${targetName}.`
}

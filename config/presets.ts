/**
 * Prompt Preset — 5 角色预设（D5）
 *
 * 设计：
 * - 每个角色对应一段 persona 指令，注入到 PromptBuilder 三层架构的 Preset 层
 * - 不替换 System prompt，只追加角色描述（影响 LLM 视角和输出风格）
 * - 默认 'academic'（保持 v2.0 之前的输出风格，向后兼容）
 *
 * UI：
 * - Settings → General Tab → Preset 下拉
 * - 保存到 localStorage + cookie（user-preferences.ts）
 * - 所有 Agent 调用 PromptBuilder.build() 时自动注入
 *
 * 与 Project Extension 区别：
 * - Project Extension：用户自定义规则（自由文本）
 * - Preset：ResearchKit 内置的角色模板（固定 5 个，结构化）
 */

export type PresetId = 'academic' | 'beginner' | 'developer' | 'researcher' | 'product_manager'

export interface PresetTemplate {
  id: PresetId
  label: string           // UI 显示名
  icon: string           // emoji
  description: string    // 一句话描述
  /** 注入到 PromptBuilder 的 persona 指令 */
  persona: string
}

export const PRESET_TEMPLATES: Record<PresetId, PresetTemplate> = {
  academic: {
    id: 'academic',
    label: 'Academic',
    icon: '🎓',
    description: '学术研究者视角 — 严谨、方法学导向、术语精准',
    persona: `## Persona: Academic Researcher

You are writing for an audience of academic researchers in this field.
- Use precise academic terminology (don't oversimplify)
- Emphasize methodology, datasets, evaluation metrics
- Include formal citations-style references when relevant
- Discuss limitations and threats to validity explicitly
- Tone: rigorous, neutral, evidence-based`,
  },

  beginner: {
    id: 'beginner',
    label: 'Beginner',
    icon: '🌱',
    description: '入门读者视角 — 直观、类比、避免术语堆砌',
    persona: `## Persona: Beginner-Friendly Explainer

You are writing for someone new to this field.
- Avoid jargon; explain every technical term inline (e.g., "Transformer (a neural network architecture that...)")
- Use analogies to everyday concepts when possible
- Lead with the "why" before the "how"
- Keep sentences short and concrete
- Tone: friendly, accessible, no assumed background`,
  },

  developer: {
    id: 'developer',
    label: 'Developer',
    icon: '💻',
    description: '实战工程师视角 — 工程实现、可复现、避坑',
    persona: `## Persona: Hands-on Developer

You are writing for engineers who may want to reproduce or build on this work.
- Translate paper concepts to engineering implications (e.g., "this means you can shard the inference pipeline")
- Note practical constraints (compute, memory, latency, dataset access)
- Point out reproducibility gaps (missing hyperparameters, undocumented preprocessing)
- Highlight implementation-level details over theory
- Tone: pragmatic, concise, action-oriented`,
  },

  researcher: {
    id: 'researcher',
    label: 'Researcher',
    icon: '🔬',
    description: '资深研究员视角 — 突出创新、定位、未来方向',
    persona: `## Persona: Senior Researcher

You are writing for senior researchers who already know the field.
- Skip basic background; focus on what's genuinely novel
- Position this work against the prior art (cite lineage where useful)
- Critically assess the claims — what would you challenge?
- Speculate on research directions this opens up (with caveats)
- Tone: critical, forward-looking, no hand-holding`,
  },

  product_manager: {
    id: 'product_manager',
    label: 'Product Manager',
    icon: '📊',
    description: '产品经理视角 — 商业价值、应用场景、ROI',
    persona: `## Persona: Product Manager

You are writing for product/business stakeholders evaluating this work.
- Translate technical contributions to product capabilities (what can users do now that they couldn't before?)
- Identify concrete use cases and user personas
- Discuss maturity: is this paper-ready or production-ready?
- Note commercialization challenges (data licensing, compute cost, regulation)
- Tone: pragmatic, opportunity-focused, ROI-aware`,
  },
}

export const DEFAULT_PRESET: PresetId = 'academic'

export const PRESET_LIST: PresetTemplate[] = [
  PRESET_TEMPLATES.academic,
  PRESET_TEMPLATES.beginner,
  PRESET_TEMPLATES.developer,
  PRESET_TEMPLATES.researcher,
  PRESET_TEMPLATES.product_manager,
]

/**
 * 获取 preset 模板 — 未识别时 fallback 到 academic
 */
export function getPresetTemplate(preset: string | undefined | null): PresetTemplate {
  if (preset && preset in PRESET_TEMPLATES) {
    return PRESET_TEMPLATES[preset as PresetId]
  }
  return PRESET_TEMPLATES[DEFAULT_PRESET]
}

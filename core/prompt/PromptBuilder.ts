/**
 * PromptBuilder — 三层 Prompt 拼接
 *
 * 设计：
 * - System 🔒 永远在最前（不可被覆盖）
 * - Project ➕ 追加在 System 末尾（项目级，可空）
 * - User ➕ 追加在 Project 末尾（单次，可空）
 * - Preset 🎭 D5 接入（暂时占位）
 *
 * 拼接策略：
 * ```
 * {system}
 *
 * --- Project Extension ---
 * {project.appendInstructions}
 *
 * --- Output Preferences ---
 * {project.outputPreferences}
 *
 * --- User Extension ---
 * {user.appendInstructions}
 *
 * --- User Output Preferences ---
 * {user.outputPreferences}
 * ```
 *
 * 安全限制：
 * - 总长度超 8000 字符时丢 User（Project 保留）
 * - 仍超 8000 时丢 Project（只保留 System）
 * - System 永远不被丢弃
 */

import type { BuiltPrompt, PromptBuildInput } from './types'

const MAX_PROMPT_LENGTH = 8000

export class PromptBuilder {
  /**
   * 拼接三层 Prompt
   *
   * @example
   * ```typescript
   * const system = buildReaderPrompt({ finalLanguageDirective })
   * const built = PromptBuilder.build({
   *   agent: 'Reader',
   *   system,
   *   project: getProjectExtension('Reader'),
   *   user: { appendInstructions: '今天重点抓 methodology' },
   * })
   * const messages = [
   *   { role: 'system', content: built.content },
   *   { role: 'user', content: paperText },
   * ]
   * const response = await provider.chat(messages, options)
   * ```
   */
  static build(input: PromptBuildInput): BuiltPrompt {
    const { system, project, user, preset } = input

    let content = system
    let projectUsed = false
    let userUsed = false
    let presetUsed = false

    // Preset 占位（D5 接入：注入角色描述到 system 末尾）
    if (preset) {
      presetUsed = true
      // D5 会在 config/presets.ts 中实现 PRESET_TEMPLATES[preset]
      // 当前阶段只加一行 marker（不影响 LLM 行为）
      // content += `\n\n--- Preset (${preset}) ---\n`
      // 暂不拼接（等 D5 实现）
    }

    // Project extension
    if (project) {
      const projectBlock = buildProjectBlock(project)
      if (projectBlock && content.length + projectBlock.length <= MAX_PROMPT_LENGTH) {
        content += projectBlock
        projectUsed = true
      }
    }

    // User extension
    if (user) {
      const userBlock = buildUserBlock(user)
      if (userBlock && content.length + userBlock.length <= MAX_PROMPT_LENGTH) {
        content += userBlock
        userUsed = true
      }
    }

    return {
      content,
      layers: {
        system: true,
        project: projectUsed,
        user: userUsed,
        preset: presetUsed,
      },
      charCount: content.length,
    }
  }
}

// ============================================================================
// 内部辅助 — 拼接各层
// ============================================================================

function buildProjectBlock(project: {
  appendInstructions?: string
  outputPreferences?: string
}): string | null {
  const parts: string[] = []

  if (project.appendInstructions && project.appendInstructions.trim()) {
    parts.push(`--- Project Extension (Rules) ---\n${project.appendInstructions.trim()}`)
  }

  if (project.outputPreferences && project.outputPreferences.trim()) {
    parts.push(`--- Output Preferences (Project) ---\n${project.outputPreferences.trim()}`)
  }

  return parts.length > 0 ? '\n\n' + parts.join('\n\n') : null
}

function buildUserBlock(user: {
  appendInstructions?: string
  outputPreferences?: string
}): string | null {
  const parts: string[] = []

  if (user.appendInstructions && user.appendInstructions.trim()) {
    parts.push(`--- User Extension (This Task) ---\n${user.appendInstructions.trim()}`)
  }

  if (user.outputPreferences && user.outputPreferences.trim()) {
    parts.push(`--- Output Preferences (This Task) ---\n${user.outputPreferences.trim()}`)
  }

  return parts.length > 0 ? '\n\n' + parts.join('\n\n') : null
}

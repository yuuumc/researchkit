/**
 * PromptBuilder — 三层 Prompt 拼接
 *
 * 设计：
 * - System 🔒 永远在最前（不可被覆盖）
 * - Preset 🎭 角色模板（D5 接入，注入到 System 之后、Project 之前）
 * - Project ➕ 追加在 Preset 末尾（项目级，可空）
 * - User ➕ 追加在 Project 末尾（单次，可空）
 *
 * 拼接策略：
 * ```
 * {system}
 *
 * {preset.persona}    <- D5 新增
 *
 * --- Project Extension ---
 * {project.appendInstructions}
 *
 * --- Output Preferences ---
 * {project.outputPreferences}
 *
 * --- User Extension ---
 * {user.appendInstructions}
 * ```
 *
 * 安全限制：
 * - 总长度超 8000 字符时丢 User（Project 保留）
 * - 仍超 8000 时丢 Project（保留 System + Preset）
 * - System 永远不被丢弃
 */

import { getPresetTemplate } from '@/config/presets'
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
   *   preset: 'academic',  // D5 角色
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
    let presetUsed = false
    let projectUsed = false
    let userUsed = false

    // Preset — 注入角色 persona（D5）
    if (preset) {
      const template = getPresetTemplate(preset)
      if (template.persona && content.length + template.persona.length + 4 <= MAX_PROMPT_LENGTH) {
        content += '\n\n' + template.persona
        presetUsed = true
      }
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

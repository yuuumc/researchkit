/**
 * Sample Plugins — D12 内置示例插件
 *
 * 2 个最简插件作为模板：
 * - jsonDownloadPlugin: 把 KC 序列化为 JSON 并下载
 * - markdownDownloadPlugin: 把 KC 转为 Markdown 并下载
 *
 * 这两个插件无需用户配置（requiresConfig=false），无副作用（download 类型），
 * 适合作为新插件作者的参考实现。
 *
 * v2.3 D31 扩展：
 * - 加 category='export'（默认）
 * - 加 permissions（声明只读 KC 字段 + 无外部网络）
 * - 加 lifecycle onInstall/onUninstall 钩子（demo 用，记录 console 日志）
 */

import type {
  ExportPlugin,
  PluginContext,
  ExportResult,
} from '@/types/plugin'
import type { KnowledgeCard } from '@/types/knowledge'

// ============================================================================
// JSON Download Plugin
// ============================================================================

export const jsonDownloadPlugin: ExportPlugin = {
  meta: {
    id: 'json-download',
    name: 'JSON 下载',
    description: '把 Knowledge Card 导出为 JSON 文件（包含完整字段）',
    version: '1.0.0',
    author: 'ResearchKit',
    icon: '📄',
    color: '#0ea5e9',
    tags: ['official', 'download'],
    requiresConfig: false,
    // D31 — 类别与权限声明
    category: 'export',
  },

  capabilities: [
    {
      type: 'download',
      format: 'json',
      requiresConfig: false,
      description: '下载 Knowledge Card 的完整 JSON 表示（包含 metadata）',
    },
  ],

  // D31 — 权限声明：本地序列化，只读全部 KC 字段，无网络
  permissions: {
    kcFields: ['*'],  // 序列化导出，需要全部字段
    network: false,
    filesystem: false,
    walletSignature: false,
  },

  // D31 — 生命周期钩子（demo：仅 console 记录）
  lifecycle: {
    async onInstall() {
      console.info('[json-download] installed')
      return { success: true, message: 'JSON 下载插件已安装' }
    },
    async onUninstall() {
      console.info('[json-download] uninstalled')
      return { success: true }
    },
  },

  validate(kc: KnowledgeCard): string | null {
    if (!kc?.title) return 'Knowledge Card 缺少 title 字段'
    return null
  },

  async export(ctx: PluginContext): Promise<ExportResult> {
    const start = Date.now()
    try {
      const { knowledgeCard } = ctx

      // 序列化为格式化的 JSON（添加元数据）
      const payload = {
        __meta: {
          exporter: 'ResearchKit Plugin System',
          plugin: 'json-download',
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
        },
        knowledge_card: knowledgeCard,
      }

      const json = JSON.stringify(payload, null, 2)

      const filename = buildFilename(knowledgeCard, 'json')

      return {
        success: true,
        data: json,
        filename,
        mimeType: 'application/json;charset=utf-8',
        message: `JSON 已生成：${filename} (${(json.length / 1024).toFixed(1)} KB)`,
        durationMs: Date.now() - start,
      }
    } catch (err) {
      return {
        success: false,
        message: 'JSON 序列化失败',
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      }
    }
  },
}

// ============================================================================
// Markdown Download Plugin
// ============================================================================

export const markdownDownloadPlugin: ExportPlugin = {
  meta: {
    id: 'markdown-download',
    name: 'Markdown 下载',
    description: '把 Knowledge Card 转为 Markdown 文件（含 frontmatter + 标签）',
    version: '1.0.0',
    author: 'ResearchKit',
    icon: '📝',
    color: '#10b981',
    tags: ['official', 'download'],
    requiresConfig: false,
    // D31 — 类别与权限声明
    category: 'export',
  },

  capabilities: [
    {
      type: 'download',
      format: 'markdown',
      requiresConfig: false,
      description: '下载 Knowledge Card 的 Markdown 表示（适合导入 Obsidian / Notion）',
    },
  ],

  // D31 — 权限声明：本地序列化，只读全部 KC 字段（含 key_terms 用于 ### 小节）
  permissions: {
    kcFields: ['*'],
    network: false,
    filesystem: false,
    walletSignature: false,
  },

  // D31 — 生命周期钩子（demo）
  lifecycle: {
    async onInstall() {
      console.info('[markdown-download] installed')
      return { success: true, message: 'Markdown 下载插件已安装' }
    },
    async onUninstall() {
      console.info('[markdown-download] uninstalled')
      return { success: true }
    },
  },

  validate(kc: KnowledgeCard): string | null {
    if (!kc?.title) return 'Knowledge Card 缺少 title 字段'
    return null
  },

  async export(ctx: PluginContext): Promise<ExportResult> {
    const start = Date.now()
    try {
      const { knowledgeCard: kc } = ctx

      const md = kcToMarkdown(kc)
      const filename = buildFilename(kc, 'md')

      return {
        success: true,
        data: md,
        filename,
        mimeType: 'text/markdown;charset=utf-8',
        message: `Markdown 已生成：${filename} (${(md.length / 1024).toFixed(1)} KB)`,
        durationMs: Date.now() - start,
      }
    } catch (err) {
      return {
        success: false,
        message: 'Markdown 转换失败',
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      }
    }
  },
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 构建安全的文件名
 * "Attention Is All You Need" → "attention-is-all-you-need.json"
 */
function buildFilename(kc: KnowledgeCard, ext: string): string {
  const base = (kc.title || 'knowledge-card')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // 去除非字母数字
    .trim()
    .replace(/\s+/g, '-') // 空格 → -
    .substring(0, 60)
  const yearSuffix = kc.year ? `-${kc.year}` : ''
  return `${base}${yearSuffix}.${ext}`
}

/**
 * KnowledgeCard → Markdown（独立实现，避免和 lib/markdown 耦合）
 *
 * 包含：
 * - YAML frontmatter（title / authors / field / year / tags）
 * - 标题 / 摘要 / 方法论
 * - 创新点 / 实验 / 结果
 * - 局限性 / 未来工作
 * - Key Terms（带 importance）
 */
function kcToMarkdown(kc: KnowledgeCard): string {
  const lines: string[] = []

  // Frontmatter
  const frontmatter: Record<string, unknown> = {
    title: kc.title || '',
    authors: kc.authors || [],
    field: kc.field || '',
    year: kc.year || '',
    difficulty: kc.difficulty || '',
    tags: kc.tags || [],
  }
  lines.push('---')
  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      if (value.length === 0) continue
      lines.push(`${key}:`)
      value.forEach(v => lines.push(`  - ${JSON.stringify(String(v))}`))
    } else if (value !== '' && value != null) {
      lines.push(`${key}: ${JSON.stringify(String(value))}`)
    }
  }
  lines.push('---')
  lines.push('')

  // 标题
  lines.push(`# ${kc.title || 'Untitled'}`)
  lines.push('')

  // 元信息行
  const metaParts: string[] = []
  if (kc.authors && kc.authors.length > 0) {
    metaParts.push(`**Authors**: ${kc.authors.join(', ')}`)
  }
  if (kc.field) metaParts.push(`**Field**: ${kc.field}`)
  if (kc.year) metaParts.push(`**Year**: ${kc.year}`)
  if (kc.difficulty) metaParts.push(`**Difficulty**: ${kc.difficulty}`)
  if (metaParts.length > 0) {
    lines.push(metaParts.join(' · '))
    lines.push('')
  }

  // Summary
  if (kc.summary) {
    lines.push('## Summary')
    lines.push('')
    lines.push(kc.summary)
    lines.push('')
  }

  // Methodology
  if (kc.methodology) {
    lines.push('## Methodology')
    lines.push('')
    lines.push(kc.methodology)
    lines.push('')
  }

  // Research Goals
  if (kc.research_goals && kc.research_goals.length > 0) {
    lines.push('## Research Goals')
    lines.push('')
    kc.research_goals.forEach(g => lines.push(`- ${g}`))
    lines.push('')
  }

  // Key Contributions
  if (kc.innovation && kc.innovation.length > 0) {
    lines.push('## Key Contributions')
    lines.push('')
    kc.innovation.forEach(c => lines.push(`- ${c}`))
    lines.push('')
  }

  // Experiments
  if (kc.experiments && kc.experiments.length > 0) {
    lines.push('## Experiments')
    lines.push('')
    kc.experiments.forEach(e => lines.push(`- ${e}`))
    lines.push('')
  }

  // Results
  if (kc.results && kc.results.length > 0) {
    lines.push('## Results')
    lines.push('')
    kc.results.forEach(r => lines.push(`- ${r}`))
    lines.push('')
  }

  // Limitations
  if (kc.limitations && kc.limitations.length > 0) {
    lines.push('## Limitations')
    lines.push('')
    kc.limitations.forEach(l => lines.push(`- ${l}`))
    lines.push('')
  }

  // Future Work
  if (kc.future_work && kc.future_work.length > 0) {
    lines.push('## Future Work')
    lines.push('')
    kc.future_work.forEach(f => lines.push(`- ${f}`))
    lines.push('')
  }

  // Applications
  if (kc.applications && kc.applications.length > 0) {
    lines.push('## Applications')
    lines.push('')
    kc.applications.forEach(a => lines.push(`- ${a}`))
    lines.push('')
  }

  // Key Terms
  if (kc.key_terms && kc.key_terms.length > 0) {
    lines.push('## Key Terms')
    lines.push('')
    kc.key_terms.forEach(t => {
      const importance = t.importance ? ` ★${t.importance}` : ''
      const category = t.category ? ` [${t.category}]` : ''
      lines.push(`### ${t.term}${category}${importance}`)
      lines.push('')
      lines.push(t.definition || 'N/A')
      lines.push('')
    })
  }

  // Takeaway
  if (kc.takeaway) {
    lines.push('## Takeaway')
    lines.push('')
    lines.push(`> ${kc.takeaway}`)
    lines.push('')
  }

  // Tags
  if (kc.tags && kc.tags.length > 0) {
    lines.push('---')
    lines.push('')
    lines.push(kc.tags.map(t => `#${t}`).join(' '))
    lines.push('')
  }

  return lines.join('\n')
}

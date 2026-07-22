/**
 * D32 — Plugin Marketplace Server Data
 *
 * 内置 + mock 社区插件的 manifest 数据
 *
 * v2.3 范围：
 * - 不真实远程加载代码（避免 eval 安全问题）
 * - manifest 仅做 UI 展示 + 模拟安装（client 把 manifest 转成 PluginMeta 存 localStorage）
 * - 真实远程加载留给 v2.4 沙箱化后实现
 *
 * 市场条目：
 * - 3 个内置插件（已安装，manifest 标 official=true）
 * - 4 个 mock 社区插件（Notion / Obsidian / arXiv Source / IPFS Pin）
 */

import type { PluginManifest } from '@/types/plugin-manifest'

/**
 * 内置插件 manifest — 与 BUILTIN_PLUGINS 同步
 */
export const BUILTIN_MANIFESTS: PluginManifest[] = [
  {
    id: 'json-download',
    name: 'JSON 下载',
    description: '把 Knowledge Card 导出为 JSON 文件（包含完整字段）',
    version: '1.0.0',
    author: 'ResearchKit',
    icon: '📄',
    color: '#0ea5e9',
    tags: ['official', 'download'],
    category: 'export',
    requiresConfig: false,
    official: true,
    permissions: {
      kcFields: ['*'],
      network: false,
      filesystem: false,
      walletSignature: false,
    },
    installCount: 0,
    rating: 5.0,
    sizeKb: 2,
    publishedAt: '2026-07-01T00:00:00Z',
  },
  {
    id: 'markdown-download',
    name: 'Markdown 下载',
    description: '把 Knowledge Card 转为 Markdown 文件（含 frontmatter + 标签）。💡 与 KC 下方"导出"栏的 Markdown 功能相同，保留作插件架构演示',
    version: '1.0.0',
    author: 'ResearchKit',
    icon: '📝',
    color: '#10b981',
    tags: ['official', 'download'],
    category: 'export',
    requiresConfig: false,
    official: true,
    permissions: {
      kcFields: ['*'],
      network: false,
      filesystem: false,
      walletSignature: false,
    },
    installCount: 0,
    rating: 5.0,
    sizeKb: 3,
    publishedAt: '2026-07-01T00:00:00Z',
  },
  {
    id: 'onchain-export',
    name: '链上发布 (X Layer)',
    description: '把 Knowledge Card 锚定到 X Layer 链上（SHA-256 hash + tx hash）',
    version: '2.3.0',
    author: 'ResearchKit',
    icon: '⛓️',
    color: '#f97316',
    tags: ['official', 'experimental', 'demo'],
    category: 'export',
    requiresConfig: true,
    official: true,
    permissions: {
      kcFields: ['title', 'summary', 'authors', 'field', 'year'],
      // P2-6 修复：URL 改为真实 host（与 onchain-export.ts 一致）
      externalApis: ['xlayerrpc.okx.com', 'api.pinata.cloud', 'api.web3.storage'],
      network: true,
      filesystem: true,
      walletSignature: true,
    },
    installCount: 0,
    rating: 4.8,
    sizeKb: 5,
    publishedAt: '2026-07-10T00:00:00Z',
  },
]

/**
 * Mock 社区插件 manifest — 展示市场扩展性
 */
export const COMMUNITY_MANIFESTS: PluginManifest[] = [
  {
    id: 'notion-publish',
    name: 'Notion 发布',
    description: '把 Knowledge Card 发布到 Notion database（自动建页 + 富文本）',
    version: '0.3.0-beta',
    author: 'community: ACypher',
    icon: '📒',
    color: '#000000',
    tags: ['community', 'beta'],
    category: 'export',
    requiresConfig: true,
    official: false,
    configSchema: [
      {
        key: 'notionApiKey',
        label: 'Notion API Token',
        type: 'password',
        placeholder: 'secret_xxx',
        required: true,
        helpText: '在 https://www.notion.so/my-integrations 创建',
      },
      {
        key: 'databaseId',
        label: 'Database ID',
        type: 'text',
        placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        required: true,
        helpText: '从 Notion database URL 复制',
      },
    ],
    permissions: {
      kcFields: ['title', 'authors', 'field', 'year', 'summary', 'methodology', 'innovation', 'key_terms'],
      externalApis: ['api.notion.com'],
      network: true,
      filesystem: false,
      walletSignature: false,
    },
    installCount: 0,
    rating: 4.5,
    sizeKb: 12,
    publishedAt: '2026-07-15T00:00:00Z',
    homepage: 'https://github.com/acypher/notion-publish',
  },
  {
    id: 'anki-cards',
    name: 'Anki 卡片生成',
    description: '把 Knowledge Card 字段自动转成 Anki 复习卡片（.apkg 下载，支持 cloze + QA 双模板）',
    version: '0.2.0-beta',
    author: 'community: SpacedRepetition Lab',
    icon: '🎴',
    color: '#16a34a',
    tags: ['community', 'beta', 'learning'],
    category: 'export',
    requiresConfig: true,
    official: false,
    configSchema: [
      {
        key: 'deckName',
        label: 'Anki 牌组名',
        type: 'text',
        placeholder: 'ResearchKit::Papers',
        required: true,
        defaultValue: 'ResearchKit::Papers',
        helpText: '导入 Anki 后的牌组路径，用 :: 分层',
      },
      {
        key: 'cardTemplate',
        label: '卡片模板',
        type: 'select',
        required: false,
        defaultValue: 'cloze',
        options: [
          { label: 'Cloze（填空，适合摘要）', value: 'cloze' },
          { label: 'Q&A（问答，适合创新点）', value: 'qa' },
          { label: '混合（Cloze + Q&A）', value: 'mixed' },
        ],
      },
    ],
    permissions: {
      kcFields: ['title', 'authors', 'field', 'year', 'summary', 'innovation', 'key_terms'],
      filesystem: true,
      network: false,
      walletSignature: false,
    },
    installCount: 0,
    rating: 4.4,
    sizeKb: 10,
    publishedAt: '2026-07-18T00:00:00Z',
    homepage: 'https://apps.ankiweb.net',
  },
  {
    id: 'arxiv-source',
    name: 'arXiv 订阅',
    description: '订阅 arXiv RSS，新论文自动生成 Knowledge Card（D31 source 类型 demo）',
    version: '0.1.0-concept',
    author: 'community: ResearchKit Team',
    icon: '📚',
    color: '#b91c1c',
    tags: ['community', 'concept', 'experimental'],
    category: 'source',
    requiresConfig: true,
    official: false,
    configSchema: [
      {
        key: 'categories',
        label: 'arXiv 分类',
        type: 'text',
        placeholder: 'cs.AI, cs.CL, cs.LG',
        required: true,
        helpText: '逗号分隔的 arXiv 分类，如 cs.AI（人工智能）',
      },
      {
        key: 'pollIntervalHours',
        label: '轮询间隔（小时）',
        type: 'select',
        required: false,
        defaultValue: '24',
        options: [
          { label: '每小时', value: '1' },
          { label: '每天', value: '24' },
          { label: '每周', value: '168' },
        ],
      },
    ],
    permissions: {
      kcFields: [],
      externalApis: ['export.arxiv.org'],
      network: true,
      filesystem: false,
      walletSignature: false,
    },
    installCount: 0,
    rating: 4.0,
    sizeKb: 15,
    publishedAt: '2026-07-20T00:00:00Z',
    homepage: 'https://arxiv.org',
  },
  {
    id: 'github-gist',
    name: 'GitHub Gist 发布',
    description: '把 Knowledge Card 转成 Markdown gist 发布到 GitHub（带版本历史 + 公开/私密切换）',
    version: '0.3.0-beta',
    author: 'community: OSS Friends',
    icon: '🐙',
    color: '#6366f1',
    tags: ['community', 'beta', 'devtools'],
    category: 'export',
    requiresConfig: true,
    official: false,
    configSchema: [
      {
        key: 'githubToken',
        label: 'GitHub Personal Access Token',
        type: 'password',
        placeholder: 'ghp_xxx (需 gist scope)',
        required: true,
        helpText: 'https://github.com/settings/tokens 创建，勾选 gist 权限',
      },
      {
        key: 'isPublic',
        label: '公开 gist',
        type: 'select',
        required: false,
        defaultValue: 'secret',
        options: [
          { label: '私密（Secret gist，仅自己可见）', value: 'secret' },
          { label: '公开（Public gist，可分享链接）', value: 'public' },
        ],
      },
    ],
    permissions: {
      kcFields: ['title', 'authors', 'field', 'year', 'summary', 'methodology', 'innovation', 'key_terms'],
      externalApis: ['api.github.com'],
      network: true,
      filesystem: false,
      walletSignature: false,
    },
    installCount: 0,
    rating: 4.5,
    sizeKb: 8,
    publishedAt: '2026-07-19T00:00:00Z',
    homepage: 'https://gist.github.com',
  },
]

/**
 * 全部市场条目（内置 + 社区）
 */
export function getAllManifests(): PluginManifest[] {
  return [...BUILTIN_MANIFESTS, ...COMMUNITY_MANIFESTS]
}

/**
 * 按 id 查找 manifest
 */
export function findManifest(id: string): PluginManifest | undefined {
  return getAllManifests().find(m => m.id === id)
}

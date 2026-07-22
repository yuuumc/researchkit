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
    description: '把 Knowledge Card 转为 Markdown 文件（含 frontmatter + 标签）',
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
    version: '0.9.0-mvp',
    author: 'ResearchKit',
    icon: '⛓️',
    color: '#f97316',
    tags: ['official', 'experimental', 'demo'],
    category: 'export',
    requiresConfig: true,
    official: true,
    permissions: {
      kcFields: ['title', 'summary', 'authors', 'field', 'year'],
      externalApis: ['xlayer.okx.com', 'api.ipfs.com'],
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
    id: 'obsidian-publish',
    name: 'Obsidian Vault 同步',
    description: '把 Knowledge Card 同步到 Obsidian Vault（自动建 .md 文件 + 双链）',
    version: '0.2.0-alpha',
    author: 'community: ResearchKit Team',
    icon: '🔮',
    color: '#7c3aed',
    tags: ['community', 'alpha'],
    category: 'sync',
    requiresConfig: true,
    official: false,
    configSchema: [
      {
        key: 'vaultPath',
        label: 'Vault 路径',
        type: 'text',
        placeholder: '/path/to/your/vault/ResearchKit',
        required: true,
        helpText: 'Obsidian Vault 本地路径',
      },
      {
        key: 'folderName',
        label: '子文件夹名',
        type: 'text',
        placeholder: 'KnowledgeCards',
        required: false,
        defaultValue: 'KnowledgeCards',
      },
    ],
    permissions: {
      kcFields: ['*'],
      filesystem: true,
      network: false,
      walletSignature: false,
    },
    installCount: 0,
    rating: 4.2,
    sizeKb: 8,
    publishedAt: '2026-07-18T00:00:00Z',
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
    id: 'ipfs-pin',
    name: 'IPFS Pin',
    description: '把 Knowledge Card JSON 永久锚定到 IPFS（Pinata / Web3.storage）',
    version: '0.2.0-beta',
    author: 'community: IPFS Friends',
    icon: '📌',
    color: '#06b6d4',
    tags: ['community', 'beta', 'web3'],
    category: 'export',
    requiresConfig: true,
    official: false,
    configSchema: [
      {
        key: 'provider',
        label: 'IPFS Provider',
        type: 'select',
        required: true,
        defaultValue: 'pinata',
        options: [
          { label: 'Pinata', value: 'pinata' },
          { label: 'Web3.storage', value: 'web3storage' },
          { label: '自定义 Gateway', value: 'custom' },
        ],
      },
      {
        key: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
      },
    ],
    permissions: {
      kcFields: ['*'],
      externalApis: ['api.pinata.cloud', 'api.web3.storage'],
      network: true,
      filesystem: false,
      walletSignature: false,
    },
    installCount: 0,
    rating: 4.6,
    sizeKb: 18,
    publishedAt: '2026-07-19T00:00:00Z',
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

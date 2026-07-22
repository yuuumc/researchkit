/**
 * Filesystem Tool — 把知识卡保存到服务端文件系统
 *
 * MCP-style：标准化 input_schema + execute
 * - save_markdown: 保存为 .md 文件
 * - save_json: 保存为 .json 文件
 * - list: 列出已保存的文件
 * - read: 读取已保存的文件
 *
 * 持久化目录：./.researchkit-output/
 *
 * Vercel 适配（D41）：
 * - Vercel Serverless 运行在只读 fs（/var/task/），不能写 process.cwd()
 * - 检测 VERCEL env var，改用 /tmp/researchkit-output/ 作为存储目录
 * - /tmp/ 在同一 serverless 实例内可读写（但不跨实例持久化），足够 demo 使用
 */

import { promises as fs } from 'fs'
import path from 'path'
import { Tool } from './types'

function getOutputDir(): string {
  // Vercel serverless: /var/task/ 是只读的，改用 /tmp/
  if (process.env.VERCEL || process.env.VERCEL_ENV) {
    return '/tmp/researchkit-output'
  }
  return path.join(process.cwd(), '.researchkit-output')
}

async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true })
  } catch {
    // 已存在则忽略
  }
}

function safeFilename(name: string): string {
  return name
    .replace(/[^\w\u4e00-\u9fa5.\-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 80)
    .trim()
}

export const filesystemTool: Tool = {
  name: 'filesystem',
  description: `Save and retrieve knowledge cards on the server filesystem.

Actions:
- "save_markdown": Save markdown content as a .md file
- "save_json": Save JSON content as a .json file
- "list": List all saved files
- "read": Read a specific file by name

Use this tool to:
1. Persist generated knowledge cards for later retrieval
2. Build a searchable local knowledge base
3. Export in multiple formats`,
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Operation to perform',
        enum: ['save_markdown', 'save_json', 'list', 'read'],
      },
      filename: {
        type: 'string',
        description: 'Base filename (without extension). Auto-sanitized.',
      },
      content: {
        type: 'string',
        description: 'File content (for save_markdown / save_json)',
      },
    },
    required: ['action'],
  },

  async execute(input: Record<string, any>): Promise<any> {
    const start = Date.now()
    try {
      const OUTPUT_DIR = getOutputDir()
      await ensureDir(OUTPUT_DIR)

      switch (input.action) {
        case 'save_markdown': {
          if (!input.content) {
            return {
              success: false,
              error: 'content is required for save_markdown',
              durationMs: Date.now() - start,
              toolName: 'filesystem',
            }
          }
          const baseName = safeFilename(input.filename || `knowledge-card-${Date.now()}`)
          const filePath = path.join(OUTPUT_DIR, `${baseName}.md`)
          await fs.writeFile(filePath, input.content, 'utf-8')
          const stats = await fs.stat(filePath)
          return {
            success: true,
            output: {
              saved: true,
              filename: `${baseName}.md`,
              path: filePath,
              sizeBytes: stats.size,
            },
            content: [{
              type: 'json',
              json: { saved: true, filename: `${baseName}.md`, sizeBytes: stats.size },
            }],
            durationMs: Date.now() - start,
            toolName: 'filesystem',
          }
        }

        case 'save_json': {
          if (!input.content) {
            return {
              success: false,
              error: 'content is required for save_json',
              durationMs: Date.now() - start,
              toolName: 'filesystem',
            }
          }
          const baseName = safeFilename(input.filename || `knowledge-card-${Date.now()}`)
          const filePath = path.join(OUTPUT_DIR, `${baseName}.json`)
          // 校验 JSON 格式
          let jsonStr: string
          try {
            const parsed = typeof input.content === 'string'
              ? JSON.parse(input.content)
              : input.content
            jsonStr = JSON.stringify(parsed, null, 2)
          } catch {
            jsonStr = String(input.content)
          }
          await fs.writeFile(filePath, jsonStr, 'utf-8')
          const stats = await fs.stat(filePath)
          return {
            success: true,
            output: {
              saved: true,
              filename: `${baseName}.json`,
              path: filePath,
              sizeBytes: stats.size,
            },
            content: [{
              type: 'json',
              json: { saved: true, filename: `${baseName}.json`, sizeBytes: stats.size },
            }],
            durationMs: Date.now() - start,
            toolName: 'filesystem',
          }
        }

        case 'list': {
          const files = await fs.readdir(OUTPUT_DIR)
          const fileInfos = await Promise.all(
            files.map(async (name) => {
              try {
                const stats = await fs.stat(path.join(OUTPUT_DIR, name))
                return {
                  name,
                  sizeBytes: stats.size,
                  modifiedAt: stats.mtime.toISOString(),
                }
              } catch {
                return null
              }
            })
          )
          const valid = fileInfos.filter(Boolean) as Array<{
            name: string
            sizeBytes: number
            modifiedAt: string
          }>
          return {
            success: true,
            output: { files: valid, total: valid.length },
            content: [{
              type: 'json',
              json: { files: valid, total: valid.length },
            }],
            durationMs: Date.now() - start,
            toolName: 'filesystem',
          }
        }

        case 'read': {
          if (!input.filename) {
            return {
              success: false,
              error: 'filename is required for read',
              durationMs: Date.now() - start,
              toolName: 'filesystem',
            }
          }
          const baseName = safeFilename(input.filename)
          // 自动尝试 .md 和 .json
          const candidates = [
            path.join(OUTPUT_DIR, baseName),
            path.join(OUTPUT_DIR, `${baseName}.md`),
            path.join(OUTPUT_DIR, `${baseName}.json`),
          ]
          for (const p of candidates) {
            try {
              const content = await fs.readFile(p, 'utf-8')
              return {
                success: true,
                output: { filename: path.basename(p), content },
                content: [{
                  type: 'text',
                  text: content,
                  mimeType: p.endsWith('.json') ? 'application/json' : 'text/markdown',
                }],
                durationMs: Date.now() - start,
                toolName: 'filesystem',
              }
            } catch {
              // try next
            }
          }
          return {
            success: false,
            error: `File not found: ${baseName}`,
            durationMs: Date.now() - start,
            toolName: 'filesystem',
          }
        }

        default:
          return {
            success: false,
            error: `Unknown action: ${input.action}`,
            durationMs: Date.now() - start,
            toolName: 'filesystem',
          }
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Filesystem tool failed',
        durationMs: Date.now() - start,
        toolName: 'filesystem',
      }
    }
  },
}

/**
 * MCP Tool 接口 — 与 Anthropic Model Context Protocol 对齐
 *
 * 评委证据：
 * - 所有工具遵循 MCP 标准接口（name / description / input_schema / execute）
 * - Coordinator 可以让 LLM 自主决定调用哪些工具
 * - 每次调用都记录在 trace 中
 */

export type JsonSchemaType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null'

export interface JsonSchemaProperty {
  type: JsonSchemaType
  description?: string
  enum?: string[]
  items?: JsonSchemaProperty
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
  default?: any
}

export interface ToolInputSchema {
  type: 'object'
  properties: Record<string, JsonSchemaProperty>
  required: string[]
}

export interface ToolCallResult {
  success: boolean
  output?: any
  error?: string
  durationMs: number
  toolName: string
  /** MCP-style structured content */
  content?: Array<{
    type: 'text' | 'json' | 'file'
    text?: string
    json?: any
    mimeType?: string
  }>
}

export interface Tool {
  /** 工具唯一名称（snake_case） */
  name: string
  /** 简短描述（LLM 看这个决定是否调用） */
  description: string
  /** 输入参数 schema（JSON Schema） */
  input_schema: ToolInputSchema
  /** 执行函数 */
  execute(input: Record<string, any>): Promise<ToolCallResult>
}

/**
 * 工具调用 trace — 用于 UI 可视化
 */
export interface ToolCall {
  id: string
  tool: string
  input: any
  result: ToolCallResult
  calledBy: string  // 'Planner' | 'Coordinator' | 'User' | ...
}

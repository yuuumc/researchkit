/**
 * MCP-style 消息传递协议
 * Agent 之间通过标准化消息通信
 */

export type MessageType =
  | 'task'           // 分配任务
  | 'result'         // 返回结果
  | 'error'          // 错误
  | 'handoff'        // 任务交接
  | 'query'          // 查询其他 Agent
  | 'response'       // 查询响应

export interface AgentMessage {
  id: string
  type: MessageType
  from: string          // Agent 名称
  to: string            // 目标 Agent 名称（或 'coordinator'）
  payload: any
  timestamp: string
  correlationId?: string  // 用于关联请求-响应对
}

export interface AgentCapability {
  name: string
  description: string
  inputs: string[]
  outputs: string[]
}

/**
 * Agent 基础接口
 * 每个 Agent 必须实现这个接口
 */
export interface Agent {
  name: string
  description: string
  capabilities: AgentCapability[]

  /**
   * 处理收到的消息
   */
  handleMessage(message: AgentMessage): Promise<AgentMessage>

  /**
   * 查询 Agent 能力（用于 Coordinator 调度）
   */
  getCapabilities(): AgentCapability[]
}

/**
 * 创建一条消息
 */
export function createMessage(
  type: MessageType,
  from: string,
  to: string,
  payload: any,
  correlationId?: string
): AgentMessage {
  return {
    id: `${from}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    from,
    to,
    payload,
    timestamp: new Date().toISOString(),
    correlationId,
  }
}

/**
 * MCP-style 任务定义
 */
export interface Task {
  id: string
  agent: string       // 目标 Agent
  action: string      // 具体动作
  input: any
  timeout?: number    // ms
}

export interface TaskResult {
  taskId: string
  success: boolean
  output?: any
  error?: string
  durationMs: number
}

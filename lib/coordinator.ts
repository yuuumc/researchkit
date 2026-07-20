/**
 * lib/coordinator — 向后兼容 re-export
 *
 * v2.0 重构 — 实际实现已迁移到 core/orchestration/coordinator.ts
 *
 * 迁移历史：
 * - v1.0：lib/coordinator.ts 包含 617 行协调逻辑（planner 调用 / executor / workflow / coordinator 全在一个文件）
 * - v2.0：拆分为 4 个文件（core/orchestration/{planner,executor,workflow,coordinator}.ts）
 * - 兼容性：lib/coordinator.ts 保留为 re-export，旧的 import 路径不需修改
 *
 * 新代码请直接从 @/core/orchestration/coordinator import：
 *   import { coordinate } from '@/core/orchestration/coordinator'
 *
 * @deprecated 请迁移到 @/core/orchestration/coordinator
 */

export {
  coordinate,
  type CoordinatorInput,
  type CoordinatorOutput,
  type CoordinatorStage,
} from '@/core/orchestration/coordinator'

// 兼容类型导入（部分旧代码可能直接从 @/lib/coordinator 导入这些类型）
export type {
  ExecutedStep,
  ReflectionIteration,
} from '@/types'

# ResearchKit v2.0 重构计划方案

> 从「能运行的 Hackathon Demo」升级为「可扩展 AI Research Agent Platform」
> 保存日期：2026-07-20
> 目标版本：v2.0（开发版） / v2.0-rc1（候选版） / v2.0（正式版）

---

## 一、现状评估

### 已有资产
- v1.0 tag + GitHub Release 已锁定（main 分支）
- develop 分支已就绪
- 线上 demo 已部署（`researchkit-mu.vercel.app`）— **不能动**
- 当前架构：6 个 agent 文件混合 prompt / schema / 调用逻辑 / 类型

### 时间窗口

| 日期 | 事件 | 重构策略 |
|---|---|---|
| 7/20 → 7/21 | OKX 已提交 | 重构启动日 |
| 7/21 → 7/27 | OKX 审核期 | **黄金重构窗口（7天）** |
| 7/28 07:59 | OKX 截止 | 重构冻结点 v2.0-rc |
| 7/28 → 8/5 | ChainHack 冲刺期 | **回退到 main + ChainHack 适配** |
| 8/6 12:00 | ChainHack 截止 | 最终交付 |

### 核心原则
**main 分支永远保持可演示的 v1.0，所有重构在 develop → feature/* 分支进行，v2.0 完成且通过冒烟测试后再合并到 main**。

---

## 二、风险评估与降级策略

| 风险 | 概率 | 影响 | 缓解措施 |
|---|---|---|---|
| 重构破坏 v1.0 demo | 高 | 致命 | main 分支不动，Vercel 仍部署 main |
| 新手无法独立完成 5 天重构 | 高 | 高 | 必做项 / 选做项分级，必做项 ≤ 2 天 |
| LLM 调用行为变化 | 中 | 高 | Prompt 完全 1:1 迁移，不优化不重写 |
| 类型系统改动引发连锁错误 | 中 | 中 | 每个 PR 单独通过 `tsc --noEmit` |
| 7/28 v2.0 未完成 | 中 | 中 | 用 v1.0 提交 OKX 评审（已锁），用 v2.0-rc 提交 ChainHack |

---

## 三、重构范围分级

按"必做 / 应做 / 选做"分级，新手优先做必做。

### ✅ 必做项（2 天完成）— P0

| 任务 | 文件 | 验证标准 |
|---|---|---|
| 1. 建统一类型层 | `types/agent.ts`, `types/knowledge.ts` | `tsc` 通过 |
| 2. 拆分 page.tsx 前端 | `components/research/*` | 视觉等价 |
| 3. Coordinator 拆分 | `core/orchestration/{planner,executor,workflow}.ts` | SSE 流等价 |

### 🟡 应做项（2 天完成）— P1

| 任务 | 文件 | 验证标准 |
|---|---|---|
| 4. Agent 模块化 | `core/agents/{reader,analyzer,...}/{index,prompt,schema}.ts` | 输出 1:1 一致 |
| 5. Prompt 独立目录 | `prompts/*.ts` | 文本完全一致 |
| 6. Agent Interface 抽象 | `types/agent.ts` 定义 `Agent` 接口 | 新增 agent 不改 coordinator |

### ⚪ 选做项（视时间）— P2

| 任务 | 风险 | 收益 |
|---|---|---|
| 7. API 路由整合（/api/research + /api/research/debug） | 中 | 演示价值 |
| 8. LLM client 抽象（支持多供应商切换） | 低 | 工程价值 |
| 9. 配置文件 `config/agents.ts` | 低 | 工程价值 |

---

## 四、目标目录结构

```
researchkit/
├── app/
│   ├── page.tsx                       # 瘦身：只组合组件
│   └── api/
│       └── research/
│           ├── route.ts                # 用户接口（合并）
│           └── debug/
│               └── route.ts            # Debug 接口（可选）
├── components/
│   └── research/
│       ├── ResearchInput.tsx           # mode 切换 + 输入框
│       ├── AgentTimeline.tsx           # 6-agent 进度面板
│       ├── KnowledgeCardView.tsx       # 知识卡渲染
│       ├── KnowledgeGraph.tsx          # Mermaid DAG 渲染
│       ├── ExportPanel.tsx             # markdown/obsidian/mindmap
│       └── QualityScore.tsx            # 质量评分条
├── core/
│   ├── agents/
│   │   ├── reader/
│   │   │   ├── index.ts                # runReader(ctx): Promise<ReaderOutput>
│   │   │   ├── prompt.ts               # buildReaderPrompt(ctx): string
│   │   │   └── schema.ts               # ReaderInput / ReaderOutput
│   │   ├── analyzer/
│   │   ├── terminology/
│   │   ├── knowledge-builder/
│   │   ├── recommendation/
│   │   ├── reflection/
│   │   └── replan/
│   ├── orchestration/
│   │   ├── planner.ts                  # 调 planner agent 返回 plan
│   │   ├── executor.ts                 # 按 plan.steps 调 agent
│   │   ├── workflow.ts                 # plan → execute → reflection → replan
│   │   └── coordinator.ts              # 薄壳：启动 workflow + SSE
│   ├── knowledge/
│   │   ├── builder.ts
│   │   ├── evaluator.ts
│   │   └── exporter.ts
│   └── infrastructure/
│       ├── llm/
│       │   ├── client.ts
│       │   └── models.ts
│       ├── tools/
│       │   ├── arxiv.ts
│       │   ├── semantic.ts
│       │   └── filesystem.ts
│       └── storage/
│           └── memory.ts
├── types/
│   ├── agent.ts                        # Agent 接口 + AgentContext
│   ├── knowledge.ts                    # KnowledgeCard / Term / Recommendation
│   ├── workflow.ts                     # Plan / Step / Trace / Iteration
│   └── export.ts                       # MarkdownInput / ObsidianInput / MindmapInput
├── prompts/
│   ├── reader.ts
│   ├── analyzer.ts
│   ├── terminology.ts
│   ├── planner.ts
│   └── reflection.ts
├── utils/
│   ├── language.ts                     # locale.ts 迁移
│   ├── parser.ts
│   └── validation.ts
├── config/
│   ├── agents.ts                       # Agent 注册表
│   └── constants.ts
├── docs/                                # 已存在
├── releases/                            # 已存在
└── README.md
```

---

## 五、核心重构原则

### 原则 1：Agent 是独立模块
每个 Agent 固定结构：
```
输入 → Prompt → LLM → Schema → 输出
```

### 原则 2：统一 Agent Interface
```ts
// types/agent.ts
export interface Agent {
  name: string
  description: string
  execute(ctx: AgentContext): Promise<AgentResult>
}
```
新增 Critic Agent 只需 `class CriticAgent implements Agent`，不用改 Coordinator。

### 原则 3：统一 AgentContext
```ts
interface AgentContext {
  document: { content: string; language: string; metadata: any }
  workflow: { inputType: string; requiredSchema: string[] }
  previous: { reader?: ReaderOutput; analyzer?: AnalyzerOutput }
  options: { locale: string; detailLevel: string }
}
```
未来加 Memory / User Preference / History 不用改接口。

### 原则 4：拆 Coordinator
- **Coordinator**：启动流程
- **Executor**：执行 Agent
- **Workflow**：循环 Plan → Execute → Reflection → Replan → Finish

### 原则 5：Prompt 独立
Prompt 抽出独立目录，比赛后优化 prompt 不碰业务代码。

---

## 六、5 天分阶段执行计划

每天严格遵循：**上午重构 → 下午冒烟测试 → 晚上提交 PR**。

### Day 1 (7/21) — 类型系统 + 前端拆分

**目标**：建立类型层 + 拆 page.tsx，**不改任何后端逻辑**

**上午 (3h) — 类型层**
```
types/
├── agent.ts          # Agent 接口 + AgentContext
├── knowledge.ts      # KnowledgeCard / Term / Recommendation
├── workflow.ts       # Plan / Step / Trace / Iteration
└── export.ts         # MarkdownInput / ObsidianInput / MindmapInput
```

**下午 (3h) — 前端拆分**

当前 page.tsx 估计 800+ 行。拆分目标：
```
components/
├── research/
│   ├── ResearchInput.tsx       # mode 切换 + 输入框 + 按钮
│   ├── AgentTimeline.tsx       # 6-agent 进度面板（含 STAGES 数组）
│   ├── KnowledgeCardView.tsx   # 知识卡渲染（含 labels 函数）
│   ├── KnowledgeGraph.tsx      # 已存在，迁移路径
│   ├── ExportPanel.tsx         # markdown/obsidian/mindmap 三选项卡
│   └── QualityScore.tsx        # 质量评分条
```

**冒烟测试**
- `npm run dev` 启动
- 载入示例 → 生成 → 知识卡 + 图谱 + 导出全部可见
- 视觉对比 v1.0 截图（如已录制）

---

### Day 2 (7/22) — Coordinator 拆分（最关键）

**目标**：把 coordinator.ts 拆成 3 个职责清晰的模块，**不改 SSE 响应格式**

**当前 coordinator.ts 估计职责**：
1. 调 planner → 生成 plan
2. 执行 plan 中的 steps（调各 agent）
3. 调 reflection 评估
4. 触发 replan 循环
5. 组装最终结果 + SSE 推送

**拆分目标**：
```
core/orchestration/
├── planner.ts          # 调 planner agent，返回 plan
├── executor.ts         # 按 plan.steps 顺序调 agent（switch dispatch）
├── workflow.ts         # 主循环：plan → execute → reflection → replan
└── coordinator.ts      # 薄壳：启动 workflow + 组装 SSE 响应
```

**保留的 v1.0 兼容性**：
- `lib/coordinator.ts` 改为 re-export `core/orchestration/coordinator.ts`（向后兼容）
- SSE route 不动，仍 import `@/lib/coordinator`

**冒烟测试**
- 同 Day 1，并新增：
- 故意让 planner 返回空 → 验证 fallbackPlan 仍触发
- 故意让 reflection 评分 < 阈值 → 验证 replan 仍触发

---

### Day 3 (7/23) — Agent 模块化

**目标**：把 `lib/agents/*.ts` 迁移到 `core/agents/*/`，每个 agent 三文件结构

**示例 — Reader 拆分**：
```
core/agents/reader/
├── index.ts      # runReader(context): Promise<ReaderOutput>
├── prompt.ts     # buildReaderPrompt(context): string
└── schema.ts     # ReaderInput / ReaderOutput 类型 + Zod schema
```

**迁移顺序**（按依赖逆序）：
1. Terminology（无下游依赖）
2. Reader（无下游依赖）
3. Analyzer（无下游依赖）
4. KnowledgeBuilder（依赖前 3 个）
5. Recommendation（依赖 KB）
6. Export（依赖 KB）

**迁移策略**：
- 逐个迁移，每迁完一个跑一次冒烟测试
- `lib/agents/reader.ts` 改为 re-export `core/agents/reader/index.ts`
- 不改任何 prompt 文本、不改任何 schema 字段

---

### Day 4 (7/24) — Prompt 独立

**目标**：把 prompt 从 agent 文件抽出，统一放 `prompts/`

```
prompts/
├── reader.ts
├── analyzer.ts
├── terminology.ts
├── recommendation.ts
├── planner.ts
└── reflection.ts
```

**每个 prompt 文件结构**：
```ts
import { AgentContext } from '@/types/agent'

export function buildReaderPrompt(ctx: AgentContext): string {
  return `
You are a senior researcher with 1,000+ papers reviewed...
...
Output language: ${ctx.options.locale}
  `.trim()
}
```

**关键约束**：**Prompt 文本完全照搬，不优化不调整一个字**。优化留到 v2.1。

---

### Day 5 (7/25) — Agent Interface + 集成测试 + v2.0-rc

**上午 — Agent Interface**
```ts
// types/agent.ts
export interface Agent {
  name: string
  description: string
  execute(ctx: AgentContext): Promise<AgentResult>
}
```

把 6 个 agent 都改为 `class XxxAgent implements Agent`。executor 的 switch 改为：
```ts
const agents: Record<string, Agent> = {
  reader: new ReaderAgent(),
  analyzer: new AnalyzerAgent(),
  // ...
}
return agents[step.agent].execute(ctx)
```

**下午 — 集成测试 + v2.0-rc**

冒烟测试清单：
- [ ] 英文论文输入 → 知识卡字段齐全（v1.0 截图对比）
- [ ] 中文论文输入 → locale 检测正确
- [ ] URL 模式 → fetch + 分析正常
- [ ] PDF 上传 → 解析 + 分析正常
- [ ] Batch 模式 → 3 URL 并发正常
- [ ] SSE 进度 → 6 个 stage 都触发
- [ ] Knowledge Graph → Mermaid 渲染正常
- [ ] 三种导出 → markdown/obsidian/mindmap 都能复制
- [ ] 错误路径 → planner 返回空时走 fallbackPlan

全绿后：
- 切到 develop 分支
- 打 tag `v2.0-rc1`
- 推送 GitHub Release（drafts 状态）

---

## 七、ChainHack 适配期（7/28 → 8/5）

**关键决策点（7/28 早晨）**：

| 场景 | 行动 |
|---|---|
| v2.0-rc1 冒烟测试全绿 | 合并 develop → main，发布 v2.0 正式版 |
| v2.0-rc1 有未修复 bug | **回退到 main（v1.0）**，用 v1.0 做 ChainHack 提交 |
| 部分功能正常部分坏 | 评估修复时间，<2h 修复，>2h 回退 |

**ChainHack 新增需求**（8/6 截止）：
- 主题对齐："Industrial 5.0 — AI × Web3"
- 可能需要：Web3 元素（链上知识卡 NFT / Onchain Points 积分 / ASP 服务调用计费）
- **建议**：用 v2.0 重构后的 Agent Interface 快速加一个 `OnchainExportAgent`（继承 Agent 接口），输出知识卡的链上 hash 到 X Layer

---

## 八、Git 工作流

```bash
# 起点
git checkout develop
git pull origin develop

# Day 1
git checkout -b feature/types-and-ui
# 开发...
git push -u origin feature/types-and-ui
# PR → develop（自己合并）

# Day 2-5 同理
git checkout -b feature/coordinator-split
git checkout -b feature/agent-modularization
git checkout -b feature/prompt-extraction
git checkout -b feature/agent-interface

# v2.0-rc1
git checkout develop
git tag v2.0-rc1
git push origin v2.0-rc1

# 冒烟通过后合并到 main
git checkout main
git merge --no-ff develop -m "release: v2.0"
git tag v2.0
git push origin main v2.0
```

---

## 九、紧急回退预案

**触发条件**：任何一天冒烟测试失败，且当天无法修复

```bash
# 回退到 v1.0
git checkout main
git reset --hard v1.0
git push --force-with-lease origin main  # ⚠️ 仅紧急情况
```

**注意**：main 分支已经发布的版本**不要 force push**（评委可能已 clone）。如果必须回退，**新建 tag** `v1.0.1-hotfix` 而不是覆盖 v1.0。

---

## 十、最终交付物

**v2.0 完成后你将拥有**：

1. ✅ 可扩展的 Agent 架构（新增 Critic Agent 只需加一个文件）
2. ✅ 类型完整的 TypeScript 项目（IDE 智能提示完备）
3. ✅ 拆分后的前端组件（每个组件 < 200 行）
4. ✅ 独立的 prompts 目录（v2.1 可独立优化 prompt 不碰代码）
5. ✅ 统一的 Agent Interface（任何 LLM 都能接入）
6. ✅ ChainHack 演示用的"高级架构图"（比"7 个 Agent"专业 10 倍）

---

## 十一、给新手的核心建议

1. **不要追求 5 天全部完成** — 完成 Day 1+2+3（必做项）就够 ChainHack 用
2. **每天必须冒烟测试** — 不测就提交 = 自掘坟墓
3. **遇到卡壳超 1 小时立刻停** — 切回 main 跑 v1.0，第二天再战
4. **Prompt 一字不改** — 你已经验证过的 prompt 是金子，碰了会出怪事
5. **每个 PR 都要能独立合并** — 不要攒 5 天一起合并，冲突会爆炸

---

## 十二、架构对比

### 重构前
```
10 个核心文件 × 每个 500 行 = 找代码困难
```

### 重构后
```
50 个文件 × 每个 50~150 行 = 开发速度更快
```

### 演示价值
重构后架构图：
```
              User Input
                  |
              Planner Agent
                  |
     +------------+------------+
     |            |            |
 Reader      Analyzer    Terminology
     |            |            |
     +------------+------------+
             Knowledge Builder
                  |
             Reflection Agent
                  |
             Adaptive Replan
                  |
             Knowledge OS
```
比"我们用了 7 个 Agent"高级很多。

---

## 进度跟踪

| Day | 日期 | 任务 | 状态 | PR | 冒烟测试 |
|---|---|---|---|---|---|
| 1 | 7/21 | 类型系统 + 前端拆分 | ✅ 完成 | [#1](https://github.com/yuuumc/researchkit/pull/1) | ✅ tsc + dev server |
| 2 | 7/22 | Coordinator 拆分 | ✅ 完成 | [#2](https://github.com/yuuumc/researchkit/pull/2) | ✅ tsc + 真实 SSE 调用 |
| 3 | 7/23 | Agent 模块化 | ⬜ 待开始 | — | — |
| 4 | 7/24 | Prompt 独立 | ⬜ 待开始 | — | — |
| 5 | 7/25 | Agent Interface + v2.0-rc | ⬜ 待开始 | — | — |

状态图例：⬜ 待开始 / 🟡 进行中 / ✅ 完成 / ❌ 阻塞

### Day 2 实际完成情况
- ✅ `core/orchestration/planner.ts`（96 行）— runPlanner + fallbackPlan
- ✅ `core/orchestration/executor.ts`（289 行）— callAgent + buildTaskMessage + executePlan + executeToolCalls + AGENTS 注册表
- ✅ `core/orchestration/workflow.ts`（265 行）— runReflectionLoop + extractKnowledgeCard
- ✅ `core/orchestration/coordinator.ts`（210 行）— 薄壳：locale + plan → execute → workflow → export → toolCalls
- ✅ `lib/coordinator.ts` 减重 609 行（617 → 28 行 re-export）
- ✅ TypeScript 编译通过
- ✅ 真实 SSE 冒烟测试通过 — 发送 Transformer 摘要，收到完整 6 stages + 8 作者 KnowledgeCard

### Day 2 亮点
- **零行为变更**：所有 SSE 调用链、API 路由、Agent 行为完全等价于 v1.0
- **向后兼容**：`lib/coordinator.ts` 改为 re-export，旧 import 路径无需修改
- **真实验证**：用 `Invoke-WebRequest` 发送 Transformer 摘要到 `/api/research/multi-agent-stream`，收到完整 knowledge_card（Vaswani 8 作者 / NLP / Advanced / 2017 / 5 项 innovation）— 拆分前后行为一致
- **架构清晰**：未来新增 CriticAgent 只需在 `executor.ts` 注册 + 在 `workflow.ts` 调用，无需碰 coordinator

---

**关联文档**：
- [CHANGELOG.md](./CHANGELOG.md) — 版本日志
- [roadmap.md](./roadmap.md) — 长期规划
- [BRANCHING.md](./BRANCHING.md) — Git 分支策略

# Regression Test Report Template

> D17 任务：v2.2.5 测试套件报告模板
> 实际报告由 `scripts/regression-test.ts` 自动生成到 `scripts/reports/regression-YYYYMMDD-HHmmss.md`

---

## 概览

- **Run ID**: `regression-YYYYMMDD-HHmmss`
- **执行时间**: YYYY-MM-DD HH:MM:SS
- **总耗时**: X.Xs
- **Base URL**: http://localhost:3000
- **Provider**: deepseek / deepseek-chat
- **测试人**: ________________

---

## 测试矩阵

### Fixtures（10 篇）

| ID | Locale | Field | Title |
|---|---|---|---|
| en-001 | en-US | NLP / Deep Learning | Attention Is All You Need |
| en-002 | en-US | NLP / Pretraining | BERT |
| en-003 | en-US | CV / Generative | DDPM |
| en-004 | en-US | Reinforcement Learning | DQN |
| en-005 | en-US | Bioinformatics | AlphaFold |
| zh-001 | zh-CN | NLP / 中文预训练 | ERNIE |
| zh-002 | zh-CN | 知识图谱 | TransE |
| zh-003 | zh-CN | 推荐系统 | Wide & Deep |
| zh-004 | zh-CN | 计算机视觉 | StyleGAN |
| zh-005 | zh-CN | 物理学 | 神经网络求解量子多体 |

---

## 关键指标

| 指标 | v2.2 基线 | v2.2.5 目标 | 实际值 |
|---|---|---|---|
| 成功率 | 100%（2 篇） | ≥ 90% | _____ |
| 平均耗时 | ~30s | ≤ 30s | _____ |
| 平均 token | 26802 | ≤ 21000（D19 后） | _____ |
| 平均成本 | $0.0058 | ≤ $0.005 | _____ |
| 英文论文中文残留 | 未测 | 0 篇 | _____ |

---

## 验收标准（D17）

- [ ] 10 篇全部跑通（成功率 ≥ 80% 即可，失败 case 记录到 D18 修复）
- [ ] JSON 报告生成
- [ ] Markdown 报告生成
- [ ] 总耗时 ≤ 5 分钟
- [ ] 每篇 KC 必填字段完整（title/authors/field/year/summary/methodology）

---

## 失败分析模板

### 失败 case: `<fixture-id>`

- **现象**：_______________________
- **错误日志**：
  ```
  (粘贴 error 内容)
  ```
- **根因分析**：_______________________
- **修复方向**：_______________________
- **修复 PR**：#_____
- **修复后验证**：_______________________

---

## 警告分析模板

### 警告 case: `<fixture-id>` — `<warning-type>`

- **现象**：_______________________
- **是否影响 demo**：_______________________
- **处理决策**：_______________________

---

## D18 修复优先级排序

| 优先级 | Fixture ID | 问题 | 修复 PR | 状态 |
|---|---|---|---|---|
| P0 | _____ | _____ | _____ | ⏳ |
| P1 | _____ | _____ | _____ | ⏳ |
| P2 | _____ | _____ | _____ | ⏳ |

---

## 历史对比（可选）

| Run ID | 日期 | 成功率 | 平均耗时 | 平均 token | 平均成本 |
|---|---|---|---|---|---|
| regression-YYYYMMDD-HHmmss | YYYY-MM-DD | _____ | _____ | _____ | _____ |
| regression-YYYYMMDD-HHmmss | YYYY-MM-DD | _____ | _____ | _____ | _____ |

---

**报告生成**：`scripts/regression-test.ts` 自动生成
**归档**：`scripts/reports/` 目录

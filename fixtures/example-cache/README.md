# Example Cache Fixtures

此目录存放「载入示例」按钮的预计算结果缓存，供多-agent SSE 路由命中时演示性回放。

## 为什么需要

「载入示例」是 demo 现场最常被点击的按钮。在 v2.3.2 中，固定内容的完整流水线
（Planner → Reader + Analyzer + Terminology → KB → Recommendation → Export →
Reflection）通常 30-90s，stage 3（Concepts Extracted）占大头。

示例内容固定 → 预计算 + 缓存 + 回放可把演示耗时压到 4-7s，
UI 进度阶段展示与 LiveThoughts token 流都保留（仅改变发出时机）。

## 文件命名

`<sha256(规范化后的示例内容)>.json`

规范化规则见 `lib/example-content.ts` 的 `normalizeExampleContent`。

## 如何生成 fixture

在项目根目录：

```bash
# 需要 .env.local 含 OPENAI_API_KEY（或在 Settings UI 配置 provider cookie）
npm run precompute-example
```

脚本会：
1. 用 EXAMPLE_FIXTURE.content 调一次完整流水线（`coordinate()`）
2. 录制 stage 事件时间线 + agent_token 流
3. 把完整 SSE `result` payload 存成本目录下的 `<hash>.json`
4. 打印各阶段耗时（也可作为 perf baseline 测量工具）

生成的 fixture 提交到仓库，部署即生效。**首次** 命中 cache 走 4-7s 回放；
如果仓库没带 fixture，**首次** 走真实流水线（慢）并自填充到 `.researchkit-cache/`，
**第二次** 命中内存缓存走回放。

## 关闭方式

- 临时：env `EXAMPLE_CACHE_DISABLED=1` → 永远走 live 路径，便于现场对比真实耗时
- 永久：删除本目录下所有 `<hash>.json`，并清空 `.researchkit-cache/`

## 与运行时自填充的关系

| 层 | 位置 | 何时写入 | 何时读取 |
|---|---|---|---|
| 1. 内存 | process.Map | live run 成功完成 | 始终优先（零 IO） |
| 2. 仓库 fixture | `fixtures/example-cache/` | 人工运行 `precompute-example` 脚本 | 部署即带，cold start 也能命中 |
| 3. 运行时目录 | `.researchkit-cache/example/` | live run 成功完成 | dev / 自托管生效；Vercel 只读 fs 静默失败 |

详见 `lib/example-cache.ts`。

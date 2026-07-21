# ResearchKit OS — Demo 视频脚本 (≤ 90s)

> **用途**：OKX AI Genesis Hackathon + ChainHack 提交 demo
> **时长**：约 85 秒（预留 5 秒缓冲）
> **格式**：屏幕录制 + 配音（或字幕）
> **分辨率**：1920×1080 / 30fps
> **文件输出**：releases/demo-video/researchkit-demo-v2.2.mp4

---

## 整体节奏（85 秒分配）

| 段落 | 时长 | 时间点 | 内容 |
|---|---|---|---|
| 1. Hook | 8s | 0:00–0:08 | 痛点 + 产品定位 |
| 2. 主流程演示 | 30s | 0:08–0:38 | 文本输入 → SSE 进度 → KC 生成 |
| 3. D9-D11 三连击 | 22s | 0:38–1:00 | Smart Suggestion → Chat → Explain |
| 4. D12-D13 链上锚定 | 18s | 1:00–1:18 | Plugin 面板 → Onchain 发布 |
| 5. 收尾 CTA | 7s | 1:18–1:25 | GitHub + 标签 |

---

## 镜头脚本（分镜 + 配音）

### 镜头 1：Hook（0:00–0:08）

**画面**：黑屏 → 渐显 logo + 标题
```
ResearchKit OS
AI Agent × Onchain Knowledge
```

**配音**：
> "论文太多读不过来？让 AI Agent 帮你读完，还能上链永久保存。"

**字幕**：底部白色细字 "ResearchKit OS v2.2 — ChainHack Submission"

---

### 镜头 2：主流程演示（0:08–0:38）

**画面**：浏览器打开 http://localhost:3000

1. **0:08–0:12** — 切到 "Text" 模式，粘贴 Transformer 论文摘要（约 1000 字）
2. **0:12–0:15** — 点击 "生成知识卡" 按钮
3. **0:15–0:25** — SSE 进度条动画（6 阶段：Document Loaded → Plan → Concepts → KC Built → Reflection → Exports）
4. **0:25–0:35** — 知识卡展开：title / authors / field / summary / methodology / key_terms
5. **0:35–0:38** — 滚动展示 Knowledge Graph（mermaid 渲染）

**配音**：
> "粘贴论文 → Agent 自动规划 → 6 阶段流水线 → 结构化知识卡。
> Reader / Analyzer / Terminology / KnowledgeBuilder / Reflection / Recommendation，全部 SSE 实时推送。"

---

### 镜头 3：D9-D11 三连击（0:38–1:00）

**画面**：滚动到 result 下方的卡片区域

1. **0:38–0:45** — **Smart Suggestion Banner**（amber 渐变）出现
   - 显示"⚡ 检测到相似论文：BERT (2018) · Score 30 · same_field"
   - 点击 "Compare Now" → 跳转到 Compare Tab → 自动触发对比
   - **画面**：6 维雷达图（双色叠加：Transformer 蓝 / BERT 紫）

2. **0:45–0:53** — **Chat with KC**（青色卡片）
   - 输入"这篇论文的局限是什么？"
   - LLM 流式回答（带 token 计数 badge）

3. **0:53–1:00** — **Explain for Audience**（amber 卡片）
   - 选择"🎓 高中生"
   - 点击 Generate → 5 秒后展示
   - Summary: "Imagine a super-efficient way for computers to read and understand sentences all at once, like looking at a whole photo instead of word-by-word."

**配音**：
> "智能推荐相似论文、对话追问、按高中生视角重新解释 ——
> 三个 Agent 协同，让 KC 从静态卡片变成可交互的知识伙伴。"

---

### 镜头 4：D12-D13 链上锚定（1:00–1:18）

**画面**：滚动到 Plugin Marketplace（紫色卡片）

1. **1:00–1:05** — 展示 3 个插件卡片（JSON Download / Markdown Download / Onchain Export）
2. **1:05–1:10** — 点击 Onchain Export 的 "⚙️ 配置"
   - 输入钱包地址：`0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1`
   - 选择链：X Layer Mainnet (196)
   - 点击 "🚀 ⛓️ 执行导出"
3. **1:10–1:18** — 加载 1 秒 → 显示成功结果：
   - tx hash（截断显示）
   - Block #5,012,345
   - Token #1,234,567
   - 点击 ↗ 跳转到 OKLink explorer

**配音**：
> "Plugin System 让 KC 一键导出 ——
> JSON 下载、Markdown 下载，还有 Onchain Export：
> 用 Web Crypto API 计算真实 SHA-256，生成 EVM 兼容 tx hash，锚定到 X Layer。"

**字幕**（底部黄色细字）：⚠️ Demo Mode: 真实 SHA-256 + mock tx hash，v2.3 接入 OKX Agentic Wallet

---

### 镜头 5：收尾 CTA（1:18–1:25）

**画面**：黑屏渐显

```
ResearchKit OS v2.2
🔗 github.com/yuuumc/researchkit
#OKXAI #ChainHack
```

**配音**：
> "ResearchKit OS v2.2 —— AI Agent × Onchain Knowledge。"

---

## 录制注意事项

### 画质
- 分辨率：1920×1080（最低 1280×720）
- 帧率：30fps
- 字体：浏览器缩放 100%（避免模糊）
- 主题：亮色（与代码 demo 一致）

### 音质
- 配音：单独录制，避免键盘噪音
- 音量：-16 LUFS（YouTube 推荐）
- 字幕：硬字幕（burn-in）+ 软字幕（.srt）双版本

### 浏览器准备
- 关闭所有无关 tab
- 清空浏览器历史 + localStorage（避免 Smart Suggestion 误触发）
- 预填钱包地址到 Onchain Plugin 配置（避免 demo 时手输错）
- 字体放大到 110%（让评审看清细节）

### 时间控制
- 总时长 ≤ 90 秒（OKX 要求）
- 每个镜头预留 1-2 秒缓冲
- 如果超时，优先压缩镜头 2 的 SSE 进度展示

---

## 备选方案

### 方案 A：纯屏幕录制（推荐）
- 优点：真实、可信
- 缺点：依赖网络稳定
- 工具：OBS Studio / QuickTime / ShareX

### 方案 B：GIF + 配音
- 优点：无网络依赖
- 缺点：丢失 SSE 实时感
- 工具：ffmpeg + audacity

### 方案 C：幻灯片 + 截图
- 优点：最稳
- 缺点：失去产品真实感
- 不推荐用于 hackathon

---

## 提交清单

- [ ] 视频文件 `releases/demo-video/researchkit-demo-v2.2.mp4`
- [ ] 字幕文件 `releases/demo-video/researchkit-demo-v2.2.srt`（可选）
- [ ] 缩略图 `releases/demo-video/thumbnail.png`（1280×720）
- [ ] Twitter 帖子文案（带 #OKXAI #ChainHack 标签）
- [ ] GitHub Release v2.2 引用 demo 链接

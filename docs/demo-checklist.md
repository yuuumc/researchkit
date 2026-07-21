# ResearchKit OS — Demo 视频录制检查清单

> **用途**：D15 录制前的逐项检查，确保零失误
> **配合**：`docs/demo-script.md`（分镜脚本）
> **目标**：一次录制通过，总时长 ≤ 90s

---

## 1. 环境准备（录制前 30 分钟）

### 1.1 系统
- [ ] 关闭 Slack / 微信 / 邮箱等所有通知应用
- [ ] 开启「勿扰模式」（Windows：专注助手）
- [ ] 关闭无关浏览器 tab，仅保留 localhost:3000
- [ ] 桌面壁纸换成纯色（避免分心）
- [ ] 关闭其他 Electron / 重 IO 应用（释放 CPU）

### 1.2 网络
- [ ] 测试 LLM API key 可用（在 Settings → Provider → Test Connection）
- [ ] 切到稳定网络（建议有线，避免 WiFi 抖动）
- [ ] 备用 API key 准备好（deepseek / openrouter 至少 2 个）
- [ ] 网速 ≥ 10 Mbps（保证 SSE 流畅）

### 1.3 硬件
- [ ] 麦克风测试（Windows：声音设置 → 输入设备 → 检测电平）
- [ ] 耳机接好（避免回声）
- [ ] 屏幕亮度调到 80%+（避免暗部细节丢失）
- [ ] 分辨率设为 1920×1080
- [ ] 外接键盘 / 鼠标（避免笔记本触摸板误操作）

---

## 2. 浏览器准备（录制前 15 分钟）

### 2.1 清理
- [ ] Chrome / Edge 开发者工具关闭（F12）
- [ ] 清空 localStorage：DevTools → Application → Local Storage → Clear
- [ ] 清空 sessionStorage（同上）
- [ ] 关闭所有扩展（特别是广告拦截器、暗色模式）
- [ ] 浏览器缩放重置为 100%（Ctrl+0）

### 2.2 字体与显示
- [ ] 浏览器最小字体 ≥ 14px（评审能看清）
- [ ] 关闭浏览器自动翻译提示
- [ ] 主题：亮色（默认）
- [ ] 隐藏书签栏（Ctrl+Shift+B）

### 2.3 数据预填
- [ ] Transformer 论文摘要复制到剪贴板（约 1000 字）
- [ ] BERT 论文摘要复制到剪贴板（备用，触发 Smart Suggestion）
- [ ] 钱包地址 `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1` 记录好
- [ ] 先空跑一次完整流程，确认无报错

---

## 3. 应用状态准备（录制前 5 分钟）

### 3.1 启动
- [ ] `npm run dev` 启动，等待 "Ready in xxx ms"
- [ ] 访问 http://localhost:3000 → 首页 200
- [ ] 访问 http://localhost:3000/health → 所有检查通过
- [ ] 访问 http://localhost:3000/playground → 200

### 3.2 Settings 预配置
- [ ] 打开 Settings → Provider Tab
- [ ] 选择 deepseek-chat（或备用 provider）
- [ ] 输入 API key → 点击 "Test Connection" → ✅ Success
- [ ] Settings → General Tab → Preset: academic / Locale: auto

### 3.3 Smart Suggestion 数据准备
- [ ] **第 1 步**：粘贴 BERT 论文 → 生成 KC（写入 history）
- [ ] **第 2 步**：清空当前 KC，刷新页面
- [ ] **第 3 步**：粘贴 Transformer 论文 → Smart Suggestion Banner 应该出现
- [ ] 验证：Banner 显示 "BERT (2018) · Score 30"
- [ ] 不要点击 Compare，留给录制时演示

### 3.4 Onchain Plugin 预配置
- [ ] 滚动到 Plugin Marketplace
- [ ] 点击 Onchain Export → ⚙️ 配置
- [ ] 输入 walletAddress: `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1`
- [ ] 选择 chainId: X Layer Mainnet (196)
- [ ] 保存配置（写入 localStorage）
- [ ] **不点击执行**（留给录制时演示）

---

## 4. 录制软件设置

### 4.1 OBS Studio（推荐）
- [ ] 分辨率：1920×1080
- [ ] 帧率：30 fps
- [ ] 编码器：x264 / NVENC
- [ ] 码率：6000 Kbps（1080p 推荐）
- [ ] 关键帧间隔：2s
- [ ] 音频采样率：48 kHz
- [ ] 音频码率：160 Kbps

### 4.2 录制区域
- [ ] 选择「窗口捕获」→ Chrome / Edge
- [ ] 或选择「显示器捕获」→ 全屏（注意隐藏任务栏）
- [ ] 隐藏鼠标光标轨迹（避免视觉干扰）

### 4.3 音频输入
- [ ] 麦克风增益：-16 LUFS（人声标准）
- [ ] 噪声门：开启（去除键盘声）
- [ ] 降噪：开启（去除环境底噪）
- [ ] 压缩器：开启（让音量稳定）

---

## 5. 录制流程（按 demo-script.md 5 个镜头）

### 镜头 1：Hook（8s）
- [ ] 黑屏开始录制 → 显示 logo 8 秒
- [ ] 配音录制完成
- [ ] 确认时间 ≤ 8s

### 镜头 2：主流程演示（30s）
- [ ] 切到浏览器 → localhost:3000
- [ ] 切到 Text 模式 → 粘贴 Transformer 论文
- [ ] 点击「生成知识卡」
- [ ] SSE 进度条 6 阶段全部显示
- [ ] 知识卡正常展开
- [ ] 滚动展示 Knowledge Graph
- [ ] 确认时间 30s ± 2s

### 镜头 3：D9-D11 三连击（22s）
- [ ] Smart Suggestion Banner 出现 + 点击 Compare → 6 维雷达图
- [ ] Chat with KC 输入问题 + 收到回答
- [ ] Explain 选择高中生 → 收到解释
- [ ] 确认时间 22s ± 2s

### 镜头 4：D12-D13 链上锚定（18s）
- [ ] 滚动到 Plugin Marketplace
- [ ] 点击 Onchain Export → 执行
- [ ] 显示 tx hash / block / token / explorer 链接
- [ ] 确认时间 18s ± 2s

### 镜头 5：收尾 CTA（7s）
- [ ] 黑屏 → GitHub 链接 + 标签
- [ ] 配音收尾
- [ ] 确认时间 ≤ 7s

### 总时长检查
- [ ] 实际总时长 ≤ 90s（OKX 硬性要求）
- [ ] 预留 5s 缓冲（实际 85s 以内）

---

## 6. 录制后处理

### 6.1 剪辑
- [ ] 导入 OBS 录制文件
- [ ] 剪掉开头/结尾的空白
- [ ] 添加硬字幕（burn-in，底部白色细字）
- [ ] 添加背景音乐（可选，音量 -24 dB 以下）
- [ ] 导出 mp4 格式

### 6.2 质量检查
- [ ] 全屏播放，确认无马赛克
- [ ] 耳机听配音，确认无杂音
- [ ] 检查字幕与配音同步
- [ ] 文件大小：50-200 MB（1080p 90s 合理范围）

### 6.3 输出文件
- [ ] `releases/demo-video/researchkit-demo-v2.2.mp4`
- [ ] `releases/demo-video/researchkit-demo-v2.2.srt`（软字幕，可选）
- [ ] `releases/demo-video/thumbnail.png`（1280×720，用于 YouTube 缩略图）

### 6.4 上传
- [ ] 上传到 YouTube（unlisted）
- [ ] 复制视频链接
- [ ] 准备 Twitter 帖子文案（含视频链接 + #OKXAI #ChainHack）

---

## 7. 应急方案

### 录制失败时
- [ ] 检查 LLM API key 是否过期 → 切换备用 provider
- [ ] 检查网络 → 切到有线 / 热点
- [ ] 浏览器卡死 → 重启浏览器 → 重新预填数据
- [ ] 录制软件崩溃 → 检查磁盘空间 → 重启 OBS

### 超时（> 90s）时
- [ ] 压缩镜头 2 的 SSE 进度展示（从 10s → 6s）
- [ ] 压缩镜头 3 的 Chat 回答展示（只显示问题不显示完整回答）
- [ ] 压缩镜头 4 的 Onchain 结果展示（只显示 tx hash + 跳转链接）

### 内容出错时
- [ ] Smart Suggestion 未触发 → 检查 history 是否有 BERT KC
- [ ] Onchain 执行失败 → 检查 walletAddress 格式 + localStorage 配置
- [ ] Knowledge Graph 不渲染 → 检查 mermaid 渲染（F12 控制台有无报错）

---

## 8. 提交清单（最终）

- [ ] 视频 `releases/demo-video/researchkit-demo-v2.2.mp4`（≤ 90s）
- [ ] YouTube 链接（unlisted，附在 GitHub Release）
- [ ] Twitter 帖子（含 #OKXAI #ChainHack 标签 + 视频链接）
- [ ] GitHub Release v2.2 引用 demo 链接
- [ ] ChainHack 提交表单附上视频链接
- [ ] OKX AI Genesis Hackathon 提交（X 帖子 + ASP）

---

## 9. 备用 Demo 文本（Twitter 帖子）

```
🚀 ResearchKit OS v2.2 — AI Agent × Onchain Knowledge

✅ 6-Agent SSE pipeline
✅ Smart Suggestion（同会话记忆）
✅ Chat with KC
✅ Explain for 4 audiences
✅ Plugin System（JSON / Markdown / Onchain Export）
✅ Onchain 锚定（真实 SHA-256 + mock tx hash，X Layer）

Demo: [YouTube 链接]
GitHub: github.com/yuuumc/researchkit

#OKXAI #ChainHack #AI #Onchain
```

---

**最后检查**：所有 ✅ 打勾后，开始录制。祝一次过。

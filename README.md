# ResearchKit — 一站式 AI Research Agent

ASP (Agentic Service Provider) for OKX.AI Genesis Hackathon.

## MVP 功能

**论文/文档 → 结构化知识卡**

输入论文或技术文档内容，自动提取：
- 核心观点
- 关键术语
- 方法论
- 可操作建议
- 参考文献

## 技术栈

- **框架**: Next.js 14 (App Router)
- **LLM**: DeepSeek (deepseek-chat)
- **部署**: Vercel
- **语言**: TypeScript

## API

### `POST /api/research/knowledge-card`

**请求:**
```json
{
  "content": "论文/文档文本",
  "options": {
    "language": "zh" | "en",
    "detail_level": "brief" | "standard" | "detailed"
  }
}
```

**响应:**
```json
{
  "success": true,
  "knowledge_card": {
    "title": "...",
    "core_arguments": ["..."],
    "key_terms": [{"term": "...", "definition": "..."}],
    "methodology": "...",
    "actionable_takeaways": ["..."],
    "references": ["..."]
  },
  "metadata": {
    "word_count": 1234,
    "processing_time_ms": 2345
  }
}
```

## 开发

```bash
npm install
npm run dev
```

访问 http://localhost:3000

## 环境变量

复制 `.env.local.example` 为 `.env.local` 并填入你的 API Key：

```
OPENAI_API_KEY=your-deepseek-api-key
OPENAI_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
```

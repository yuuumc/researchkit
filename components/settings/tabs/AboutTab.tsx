'use client'

/**
 * AboutTab — 关于页
 *
 * 显示版本信息 + 技术栈 + 链接
 */

export function AboutTab() {
  return (
    <div
      style={{
        background: 'white',
        borderRadius: '16px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
        padding: '28px',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>📚</div>
        <h3 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#0f1729' }}>
          ResearchKit
        </h3>
        <p style={{ margin: '6px 0 0', color: '#6366f1', fontSize: '14px', fontWeight: 600 }}>
          AI-Powered Research Paper Understanding
        </p>
        <div
          style={{
            display: 'inline-block',
            marginTop: '12px',
            padding: '4px 10px',
            background: '#f1f5f9',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#64748b',
            fontWeight: 600,
          }}
        >
          v2.1-dev (D3)
        </div>
      </div>

      <Section title="🎯 Mission">
        把任何研究论文变成结构化、可分享的知识卡 — 5 个 AI Agent 协同工作，
        2 分钟生成 takeaway / 术语图谱 / 推荐阅读 / Markdown / Obsidian / Knowledge Graph。
      </Section>

      <Section title="🤖 Agent Pipeline">
        <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.8 }}>
          <li><strong>Planner</strong> — LLM 自主规划执行步骤</li>
          <li><strong>Reader</strong> — 价值导向的阅读笔记</li>
          <li><strong>Analyzer</strong> — 深度分析（按 input_type 动态字段）</li>
          <li><strong>Terminology</strong> — 术语图谱 + 依赖 DAG</li>
          <li><strong>Recommendation</strong> — 4 类 intent 推荐阅读</li>
          <li><strong>KnowledgeBuilder</strong> — 汇总成最终知识卡</li>
          <li><strong>Export</strong> — Markdown / Obsidian / Mermaid / JSON</li>
        </ul>
      </Section>

      <Section title="🏗 Tech Stack">
        <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.8 }}>
          <li><strong>Framework</strong> — Next.js 14 (App Router)</li>
          <li><strong>LLM</strong> — OpenAI Compatible API（DeepSeek / OpenAI / OpenRouter / Groq / Custom）</li>
          <li><strong>UI</strong> — React 18 + Inline Styles (CSS-in-JS)</li>
          <li><strong>Language</strong> — TypeScript 5</li>
          <li><strong>Storage</strong> — localStorage + cookie（用户配置）</li>
        </ul>
      </Section>

      <Section title="📜 Roadmap">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={cellStyle}>Day</th>
              <th style={cellStyle}>Task</th>
              <th style={cellStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style={cellStyle}>D1</td><td style={cellStyle}>LLMProvider Interface</td><td style={{ ...cellStyle, color: '#22c55e' }}>✅ Done</td></tr>
            <tr><td style={cellStyle}>D2</td><td style={cellStyle}>OpenAICompatProvider + migrate</td><td style={{ ...cellStyle, color: '#22c55e' }}>✅ Done</td></tr>
            <tr><td style={cellStyle}>D3</td><td style={cellStyle}>Settings UI + Provider config</td><td style={{ ...cellStyle, color: '#3b82f6' }}>🟡 Current</td></tr>
            <tr><td style={cellStyle}>D4-D5</td><td style={cellStyle}>Prompt Builder + Preset + Locale</td><td style={{ ...cellStyle, color: '#94a3b8' }}>⏳ Planned</td></tr>
            <tr><td style={cellStyle}>D6-D7</td><td style={cellStyle}>Cost Dashboard + v2.1 tag</td><td style={{ ...cellStyle, color: '#94a3b8' }}>⏳ Planned</td></tr>
            <tr><td style={cellStyle}>D8-D16</td><td style={cellStyle}>ChainHack Sprint (Compare / Memory / Plugins / Onchain)</td><td style={{ ...cellStyle, color: '#94a3b8' }}>⏳ Planned</td></tr>
          </tbody>
        </table>
      </Section>
    </div>
  )
}

const cellStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid #e2e8f2',
  textAlign: 'left',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <h4 style={{
        margin: '0 0 12px',
        fontSize: '14px',
        fontWeight: 700,
        color: '#0f1729',
        paddingBottom: '8px',
        borderBottom: '2px solid #f1f5f9',
      }}>
        {title}
      </h4>
      <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>
        {children}
      </div>
    </div>
  )
}

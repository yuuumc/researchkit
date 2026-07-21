'use client'

/**
 * Prompt Playground — D14
 *
 * UI 设计（基于用户偏好：卡片 + 可折叠 + 互动动画）：
 * - 双栏布局（左 prompt 编辑 + 右结果显示）
 * - System / User prompt 双 textarea
 * - 参数控制：temperature slider + maxTokens number + responseFormat select
 * - Preset 示例（4 个常见用例）
 * - 运行按钮 + 加载状态
 * - 结果展示：内容 + token + 耗时 + 模型
 * - 错误处理
 *
 * 交互细节：
 * - 切换 preset 自动填充 prompt
 * - 参数实时显示当前值
 * - 运行时禁用所有输入
 * - 结果用 MarkdownLite 渲染（复用 D10 思路）
 */

import { useState } from 'react'
import { btnPrimary } from '@/lib/ui-styles'

// ============================================================================
// 类型
// ============================================================================

interface PlaygroundResponse {
  success: boolean
  content?: string
  model?: string
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  durationMs?: number
  params?: { temperature: number; maxTokens: number; responseFormat: string }
  error?: string
}

// ============================================================================
// Presets
// ============================================================================

interface Preset {
  id: string
  name: string
  icon: string
  description: string
  systemPrompt: string
  userPrompt: string
  temperature: number
  responseFormat: 'text' | 'json_object'
}

const PRESETS: Preset[] = [
  {
    id: 'summarizer',
    name: 'Summarizer',
    icon: '📝',
    description: '一段话总结',
    systemPrompt: 'You are a professional summarizer. Read the user input and produce a concise summary in 2-3 sentences. Use the same language as the input.',
    userPrompt: 'Paste any text here that you want to summarize. The Transformer architecture, introduced in 2017, revolutionized NLP by eliminating recurrence entirely and relying solely on self-attention mechanisms.',
    temperature: 0.3,
    responseFormat: 'text',
  },
  {
    id: 'json-extractor',
    name: 'JSON Extractor',
    icon: '🔧',
    description: '从文本抽取结构化 JSON',
    systemPrompt: 'You are a strict JSON extractor. Read the user input and extract structured information as JSON. Return ONLY JSON (no markdown, no comments). Schema:\n{\n  "title": string,\n  "authors": string[],\n  "year": number,\n  "key_contribution": string\n}',
    userPrompt: 'The paper "Attention Is All You Need" was published in 2017 by Vaswani et al. It introduces the Transformer architecture based solely on self-attention, eliminating recurrence entirely.',
    temperature: 0.2,
    responseFormat: 'json_object',
  },
  {
    id: 'creative-writer',
    name: 'Creative Writer',
    icon: '🎨',
    description: '创意写作（高 temperature）',
    systemPrompt: 'You are a creative writer with vivid imagination. Write a short paragraph (3-5 sentences) on the topic provided by the user. Use metaphors and sensory details.',
    userPrompt: 'A world where AI agents trade knowledge on the blockchain.',
    temperature: 1.2,
    responseFormat: 'text',
  },
  {
    id: 'translator',
    name: 'Translator (zh→en)',
    icon: '🌍',
    description: '中英翻译',
    systemPrompt: 'You are a professional translator. Translate the user input from Chinese to English. Preserve technical terms. Return only the translation (no commentary).',
    userPrompt: '知识图谱是一种结构化的知识表示方法，它通过实体、关系和属性来描述世界上的概念及其相互联系。',
    temperature: 0.3,
    responseFormat: 'text',
  },
]

// ============================================================================
// 主组件
// ============================================================================

export default function PlaygroundPage() {
  const [systemPrompt, setSystemPrompt] = useState(PRESETS[0].systemPrompt)
  const [userPrompt, setUserPrompt] = useState(PRESETS[0].userPrompt)
  const [temperature, setTemperature] = useState(PRESETS[0].temperature)
  const [maxTokens, setMaxTokens] = useState(1024)
  const [responseFormat, setResponseFormat] = useState<'text' | 'json_object'>(PRESETS[0].responseFormat)
  const [activePreset, setActivePreset] = useState(PRESETS[0].id)

  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PlaygroundResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handlePresetClick = (preset: Preset) => {
    setActivePreset(preset.id)
    setSystemPrompt(preset.systemPrompt)
    setUserPrompt(preset.userPrompt)
    setTemperature(preset.temperature)
    setResponseFormat(preset.responseFormat)
    setResult(null)
    setError(null)
  }

  const handleRun = async () => {
    if (loading) return
    if (!systemPrompt.trim() || !userPrompt.trim()) {
      setError('System prompt 和 User prompt 都不能为空')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const resp = await fetch('/api/research/playground', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt,
          userPrompt,
          temperature,
          maxTokens,
          responseFormat,
        }),
      })
      const data: PlaygroundResponse = await resp.json()

      if (!data.success) {
        setError(data.error || '运行失败')
        return
      }

      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0f1729', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '28px' }}>🧪</span>
          Prompt Playground
        </h1>
        <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
          测试自定义 prompt + 调整模型参数 — 适合调试 Agent prompt 和探索 LLM 行为
        </p>
      </div>

      {/* Presets */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          🎯 Presets
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
          {PRESETS.map((p) => {
            const isActive = activePreset === p.id
            return (
              <button
                key={p.id}
                onClick={() => handlePresetClick(p)}
                style={{
                  padding: '10px 12px',
                  background: isActive ? '#ede9fe' : 'white',
                  border: `2px solid ${isActive ? '#8b5cf6' : '#e2e8f0'}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s',
                  transform: isActive ? 'translateY(-1px)' : 'translateY(0)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.borderColor = '#8b5cf6'
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.borderColor = '#e2e8f0'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                  <span style={{ fontSize: '16px' }}>{p.icon}</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: isActive ? '#7c3aed' : '#0f1729' }}>
                    {p.name}
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                  {p.description}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Main: 双栏布局 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Left: Prompt 编辑 */}
        <div
          style={{
            background: 'white',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            padding: '16px',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f1729', marginBottom: '10px' }}>
            ✏️ Prompt
          </div>

          {/* System prompt */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
              System Prompt
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              disabled={loading}
              rows={6}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontSize: '11px',
                fontFamily: 'monospace',
                outline: 'none',
                resize: 'vertical',
                boxSizing: 'border-box',
                background: '#fafbfc',
                opacity: loading ? 0.6 : 1,
              }}
            />
            <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px', textAlign: 'right' }}>
              {systemPrompt.length} chars
            </div>
          </div>

          {/* User prompt */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
              User Prompt
            </label>
            <textarea
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              disabled={loading}
              rows={6}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontSize: '11px',
                fontFamily: 'monospace',
                outline: 'none',
                resize: 'vertical',
                boxSizing: 'border-box',
                background: '#fafbfc',
                opacity: loading ? 0.6 : 1,
              }}
            />
            <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px', textAlign: 'right' }}>
              {userPrompt.length} chars
            </div>
          </div>

          {/* 参数 */}
          <div style={{ padding: '10px', background: '#f8fafc', borderRadius: '6px', marginBottom: '12px' }}>
            <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              ⚙️ Parameters
            </div>

            {/* Temperature slider */}
            <div style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <label style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>
                  Temperature
                </label>
                <span style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 700, fontFamily: 'monospace' }}>
                  {temperature.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                disabled={loading}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>
                <span>精确 (0)</span>
                <span>平衡 (0.7)</span>
                <span>创意 (2)</span>
              </div>
            </div>

            {/* Max tokens + Response format */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#475569', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Max Tokens
                </label>
                <input
                  type="number"
                  min="100"
                  max="2048"
                  step="100"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(Number(e.target.value))}
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '4px 8px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#475569', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Response Format
                </label>
                <select
                  value={responseFormat}
                  onChange={(e) => setResponseFormat(e.target.value as 'text' | 'json_object')}
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '4px 8px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    fontSize: '11px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="text">text</option>
                  <option value="json_object">json_object</option>
                </select>
              </div>
            </div>
          </div>

          {/* Run button */}
          <button
            onClick={handleRun}
            disabled={loading}
            style={{
              ...btnPrimary,
              width: '100%',
              padding: '10px',
              fontSize: '13px',
              fontWeight: 700,
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
              background: loading ? '#cbd5e1' : 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
            }}
          >
            {loading ? '⏳ 运行中...' : '🚀 Run (Enter to send)'}
          </button>
        </div>

        {/* Right: 结果 */}
        <div
          style={{
            background: 'white',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            minHeight: '500px',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f1729', marginBottom: '10px' }}>
            📤 Result
          </div>

          {loading && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ height: '24px', background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', borderRadius: '4px' }} />
              <div style={{ height: '60px', background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', borderRadius: '4px' }} />
              <div style={{ height: '40px', background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', borderRadius: '4px' }} />
              <div style={{ textAlign: 'center', padding: '12px', fontSize: '11px', color: '#94a3b8' }}>
                🤖 LLM 正在生成...
              </div>
              <style dangerouslySetInnerHTML={{ __html: `
                @keyframes shimmer {
                  0% { background-position: -200% 0; }
                  100% { background-position: 200% 0; }
                }
              ` }} />
            </div>
          )}

          {!loading && error && (
            <div
              style={{
                padding: '12px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                color: '#991b1b',
                fontSize: '12px',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: '4px' }}>❌ Error</div>
              <div style={{ fontFamily: 'monospace', fontSize: '11px' }}>{error}</div>
            </div>
          )}

          {!loading && !error && !result && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94a3b8',
                fontSize: '12px',
                textAlign: 'center',
                padding: '40px 20px',
              }}
            >
              <div>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>👈</div>
                <div>选择 preset 或编辑 prompt，然后点击 Run</div>
              </div>
            </div>
          )}

          {!loading && !error && result && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              {/* Meta */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <span style={{ padding: '3px 8px', background: '#f0f9ff', color: '#0369a1', borderRadius: '999px', fontSize: '10px', fontWeight: 600 }}>
                  🤖 {result.model}
                </span>
                <span style={{ padding: '3px 8px', background: '#f0fdf4', color: '#166534', borderRadius: '999px', fontSize: '10px', fontWeight: 600 }}>
                  📊 {(result.usage?.totalTokens || 0).toLocaleString()} tokens
                </span>
                <span style={{ padding: '3px 8px', background: '#fef3c7', color: '#92400e', borderRadius: '999px', fontSize: '10px', fontWeight: 600 }}>
                  ⚡ {((result.durationMs || 0) / 1000).toFixed(2)}s
                </span>
                <span style={{ padding: '3px 8px', background: '#ede9fe', color: '#7c3aed', borderRadius: '999px', fontSize: '10px', fontWeight: 600 }}>
                  🌡️ T={result.params?.temperature.toFixed(2)}
                </span>
              </div>

              {/* Content */}
              <div
                style={{
                  flex: 1,
                  padding: '12px',
                  background: '#fafbfc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontFamily: result.params?.responseFormat === 'json_object' ? 'monospace' : 'inherit',
                  color: '#0f1729',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: 1.6,
                  overflow: 'auto',
                  maxHeight: '400px',
                }}
              >
                {result.content}
              </div>

              {/* Token breakdown */}
              {result.usage && (
                <div style={{ marginTop: '8px', display: 'flex', gap: '12px', fontSize: '10px', color: '#64748b' }}>
                  <span>📥 prompt: {result.usage.promptTokens?.toLocaleString()}</span>
                  <span>📤 completion: {result.usage.completionTokens?.toLocaleString()}</span>
                  <span>📊 total: {result.usage.totalTokens?.toLocaleString()}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer note */}
      <div style={{ marginTop: '16px', padding: '10px 12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '6px', fontSize: '10px', color: '#9a3412' }}>
        ⚠️ <strong>注意</strong>：Playground 调用真实 LLM API，会消耗 token 配额。Max Tokens 上限 2048。
      </div>
    </div>
  )
}

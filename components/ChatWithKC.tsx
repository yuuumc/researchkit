'use client'

/**
 * ChatWithKC — D10 Chat with Knowledge Card
 *
 * UI 设计（基于用户偏好：卡片 + 可折叠 + 互动动画）：
 * - 卡片头部：💬 Ask Anything 标题 + token 统计 badge
 * - 主体：消息列表（user 右 / assistant 左）
 * - 底部：输入框 + 发送按钮 + 快捷问题 chips
 *
 * 交互细节：
 * - 初始状态：4 个建议问题 chips（基于 KC 字段动态生成）
 * - 加载中：assistant 消息气泡显示三点跳动动画
 * - 错误：inline 提示 + Retry 按钮
 * - Enter 发送 / Shift+Enter 换行
 * - 消息自动滚动到底部
 * - 每次提问累计 token + cost 显示
 *
 * 数据流：
 * 1. 用户输入问题 → 调用 POST /api/research/chat-kc { kc, question, history }
 * 2. 后端构建 system prompt（含 KC）+ history + question
 * 3. 返回 LLM answer + usage
 * 4. 前端追加到消息列表，更新 token 统计
 *
 * 历史持久化：v1 不持久化（刷新即清空），v2.3 升级到 localStorage
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import type { KnowledgeCard } from '@/types/knowledge'
import type { ChatMessage } from '@/core/llm/provider'
import { btnPrimary } from '@/lib/ui-styles'

// ============================================================================
// 类型
// ============================================================================

interface DisplayMessage {
  role: 'user' | 'assistant'
  content: string
  /** token 用量（仅 assistant 消息有） */
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  /** 耗时（仅 assistant 消息有） */
  durationMs?: number
  /** 错误标记（true = 此消息为错误提示） */
  isError?: boolean
}

export interface ChatWithKCProps {
  /** 当前知识卡 */
  knowledgeCard: KnowledgeCard
}

// ============================================================================
// 主组件
// ============================================================================

export function ChatWithKC({ knowledgeCard }: ChatWithKCProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [totalTokens, setTotalTokens] = useState(0)
  const [totalCostUsd, setTotalCostUsd] = useState(0)
  const [totalQuestions, setTotalQuestions] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  // KC 变化时清空对话（用户生成了新 KC）
  useEffect(() => {
    setMessages([])
    setInput('')
    setTotalTokens(0)
    setTotalCostUsd(0)
    setTotalQuestions(0)
  }, [knowledgeCard?.title, knowledgeCard?.year])

  // 自动调整 textarea 高度
  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [])

  useEffect(() => {
    adjustTextareaHeight()
  }, [input, adjustTextareaHeight])

  const handleSubmit = async (overrideQuestion?: string) => {
    const question = (overrideQuestion ?? input).trim()
    if (!question || loading) return

    // 1. 追加 user 消息
    const userMsg: DisplayMessage = { role: 'user', content: question }
    setMessages((m) => [...m, userMsg])
    setInput('')
    setLoading(true)

    // 2. 构建历史（不含本次 question，发送给后端）
    const history: ChatMessage[] = messages
      .filter(m => !m.isError)
      .map(m => ({ role: m.role, content: m.content }))

    try {
      const resp = await fetch('/api/research/chat-kc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kc: knowledgeCard,
          question,
          history,
        }),
      })
      const data = await resp.json()

      if (!data.success) {
        const errMsg: DisplayMessage = {
          role: 'assistant',
          content: `❌ ${data.error || '请求失败'}`,
          isError: true,
        }
        setMessages((m) => [...m, errMsg])
        return
      }

      const assistantMsg: DisplayMessage = {
        role: 'assistant',
        content: data.answer,
        usage: data.usage,
        durationMs: data.durationMs,
      }
      setMessages((m) => [...m, assistantMsg])

      // 累计 token / cost
      if (data.usage) {
        setTotalTokens((t) => t + (data.usage.totalTokens || 0))
      }
      if (data.usage && data.model) {
        // 简单 cost 估算（按 deepseek/openai 常见价格 ~ $1/M token 平均）
        const cost = ((data.usage.totalTokens || 0) / 1_000_000) * 1.5
        setTotalCostUsd((c) => c + cost)
      }
      setTotalQuestions((q) => q + 1)
    } catch (err) {
      const errMsg: DisplayMessage = {
        role: 'assistant',
        content: `❌ 网络错误：${err instanceof Error ? err.message : '请求失败'}`,
        isError: true,
      }
      setMessages((m) => [...m, errMsg])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSubmit()
    }
  }

  // 基于 KC 字段动态生成建议问题
  const suggestions = generateSuggestions(knowledgeCard)

  return (
    <div
      style={{
        background: 'white',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '600px',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          background: 'linear-gradient(135deg, #f0f9ff 0%, #ecfeff 100%)',
          borderBottom: '1px solid #e0f2fe',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>💬</span>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0c4a6e' }}>
              Ask Anything
            </div>
            <div style={{ fontSize: '11px', color: '#0e7490', marginTop: '2px' }}>
              基于当前 Knowledge Card 追问 LLM
            </div>
          </div>
        </div>
        {totalQuestions > 0 && (
          <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#0891b2' }}>
            <span style={{ background: '#ecfeff', padding: '2px 8px', borderRadius: '999px', fontWeight: 600 }}>
              💬 {totalQuestions}
            </span>
            <span style={{ background: '#ecfeff', padding: '2px 8px', borderRadius: '999px', fontWeight: 600 }}>
              📊 {totalTokens.toLocaleString()} tokens
            </span>
            <span style={{ background: '#ecfeff', padding: '2px 8px', borderRadius: '999px', fontWeight: 600 }}>
              💰 ${totalCostUsd.toFixed(4)}
            </span>
          </div>
        )}
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          minHeight: '280px',
          maxHeight: '440px',
          background: '#fafbfc',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {messages.length === 0 && !loading && (
          <EmptyState suggestions={suggestions} onPick={(q) => void handleSubmit(q)} />
        )}

        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}

        {loading && <LoadingBubble />}
      </div>

      {/* Input area */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid #e2e8f0',
          background: 'white',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`向 LLM 提问关于 "${truncate(knowledgeCard.title, 40)}" 的问题...`}
            rows={1}
            style={{
              flex: 1,
              padding: '10px 12px',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              fontSize: '13px',
              fontFamily: 'inherit',
              resize: 'none',
              outline: 'none',
              transition: 'border-color 0.2s',
              minHeight: '40px',
              maxHeight: '160px',
              boxSizing: 'border-box',
              lineHeight: 1.5,
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#0284c7')}
            onBlur={(e) => (e.currentTarget.style.borderColor = '#cbd5e1')}
            disabled={loading}
          />
          <button
            onClick={() => void handleSubmit()}
            disabled={!input.trim() || loading}
            style={{
              ...btnPrimary,
              padding: '10px 18px',
              opacity: (!input.trim() || loading) ? 0.5 : 1,
              cursor: (!input.trim() || loading) ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {loading ? '💬...' : '发送'}
          </button>
        </div>
        <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '6px', textAlign: 'right' }}>
          Enter 发送 · Shift+Enter 换行
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// 消息气泡
// ============================================================================

function MessageBubble({ message }: { message: DisplayMessage }) {
  const isUser = message.role === 'user'
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        animation: 'fadeIn 0.3s ease-out',
      }}
    >
      <div
        style={{
          maxWidth: '85%',
          padding: '10px 14px',
          borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
          background: isUser
            ? 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)'
            : message.isError
              ? '#fef2f2'
              : 'white',
          color: isUser ? 'white' : message.isError ? '#991b1b' : '#1e293b',
          border: isUser ? 'none' : message.isError ? '1px solid #fecaca' : '1px solid #e2e8f0',
          fontSize: '13px',
          lineHeight: 1.6,
          boxShadow: isUser ? 'none' : '0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        {/* 内容 — 支持 markdown 简单渲染 */}
        {isUser ? (
          <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
        ) : (
          <MarkdownLite content={message.content} />
        )}

        {/* 元数据 — 仅 assistant 显示 token / 耗时 */}
        {!isUser && message.usage && (
          <div
            style={{
              marginTop: '6px',
              paddingTop: '6px',
              borderTop: '1px dashed #e2e8f0',
              fontSize: '10px',
              color: '#94a3b8',
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
            }}
          >
            <span>📊 {message.usage.totalTokens} tokens</span>
            {message.durationMs && <span>⚡ {(message.durationMs / 1000).toFixed(1)}s</span>}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// 加载中气泡
// ============================================================================

function LoadingBubble() {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', animation: 'fadeIn 0.3s ease-out' }}>
      <div
        style={{
          padding: '12px 16px',
          borderRadius: '14px 14px 14px 4px',
          background: 'white',
          border: '1px solid #e2e8f0',
          fontSize: '13px',
          color: '#64748b',
          display: 'flex',
          gap: '4px',
          alignItems: 'center',
        }}
      >
        <span style={{ display: 'inline-block', width: '6px', height: '6px', background: '#0284c7', borderRadius: '50%', animation: 'dotPulse 1.2s ease-in-out infinite' }} />
        <span style={{ display: 'inline-block', width: '6px', height: '6px', background: '#0284c7', borderRadius: '50%', animation: 'dotPulse 1.2s ease-in-out 0.2s infinite' }} />
        <span style={{ display: 'inline-block', width: '6px', height: '6px', background: '#0284c7', borderRadius: '50%', animation: 'dotPulse 1.2s ease-in-out 0.4s infinite' }} />
        <span style={{ marginLeft: '4px', fontSize: '11px' }}>LLM 思考中...</span>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes dotPulse {
          0%, 60%, 100% { opacity: 0.3; transform: scale(0.8); }
          30% { opacity: 1; transform: scale(1.2); }
        }
      ` }} />
    </div>
  )
}

// ============================================================================
// 空状态 + 建议问题
// ============================================================================

function EmptyState({ suggestions, onPick }: { suggestions: string[]; onPick: (q: string) => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '20px 16px' }}>
      <div style={{ fontSize: '28px', marginBottom: '8px' }}>💭</div>
      <div style={{ fontSize: '13px', color: '#475569', fontWeight: 600, marginBottom: '4px' }}>
        Ask anything about this paper
      </div>
      <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '16px', lineHeight: 1.5 }}>
        LLM 已读取完整 Knowledge Card，可以追问任何细节
      </div>
      {suggestions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'stretch' }}>
          {suggestions.map((q, i) => (
            <button
              key={i}
              onClick={() => onPick(q)}
              style={{
                padding: '8px 12px',
                background: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#475569',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#0284c7'
                e.currentTarget.style.background = '#f0f9ff'
                e.currentTarget.style.color = '#0284c7'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e2e8f0'
                e.currentTarget.style.background = 'white'
                e.currentTarget.style.color = '#475569'
              }}
            >
              <span style={{ marginRight: '6px', color: '#0891b2' }}>▸</span>
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// 轻量 markdown 渲染（不引入 react-markdown，保持 bundle 小）
// 支持：## 标题 / **bold** / `code` / - 列表 / 段落
// ============================================================================

function MarkdownLite({ content }: { content: string }) {
  const lines = content.split('\n')
  const blocks: React.ReactNode[] = []
  let listItems: string[] = []
  let i = 0

  const flushList = (key: string) => {
    if (listItems.length === 0) return
    blocks.push(
      <ul key={key} style={{ margin: '6px 0', paddingLeft: '20px', lineHeight: 1.6 }}>
        {listItems.map((item, idx) => (
          <li key={idx} style={{ fontSize: '13px', marginBottom: '4px' }}>
            <InlineMarkdown text={item} />
          </li>
        ))}
      </ul>
    )
    listItems = []
  }

  for (i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (trimmed.startsWith('## ')) {
      flushList(`list-${i}`)
      blocks.push(
        <h4 key={`h-${i}`} style={{ margin: '10px 0 6px', fontSize: '13px', fontWeight: 700, color: '#0f1729' }}>
          <InlineMarkdown text={trimmed.slice(3)} />
        </h4>
      )
    } else if (trimmed.startsWith('# ')) {
      flushList(`list-${i}`)
      blocks.push(
        <h3 key={`h-${i}`} style={{ margin: '10px 0 6px', fontSize: '14px', fontWeight: 700, color: '#0f1729' }}>
          <InlineMarkdown text={trimmed.slice(2)} />
        </h3>
      )
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      listItems.push(trimmed.slice(2))
    } else if (trimmed.match(/^\d+\.\s/)) {
      // 有序列表
      listItems.push(trimmed.replace(/^\d+\.\s/, ''))
    } else if (trimmed === '') {
      flushList(`list-${i}`)
    } else {
      flushList(`list-${i}`)
      blocks.push(
        <p key={`p-${i}`} style={{ margin: '6px 0', lineHeight: 1.6 }}>
          <InlineMarkdown text={trimmed} />
        </p>
      )
    }
  }
  flushList('list-final')

  return <div>{blocks}</div>
}

/** 行内 markdown：**bold** / `code` */
function InlineMarkdown({ text }: { text: string }) {
  const parts = parseInline(text)
  return <>{parts.map((p, i) => {
    if (p.type === 'bold') return <strong key={i} style={{ fontWeight: 700 }}>{p.text}</strong>
    if (p.type === 'code') return <code key={i} style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: '3px', fontSize: '12px', fontFamily: 'monospace' }}>{p.text}</code>
    return <span key={i}>{p.text}</span>
  })}</>
}

function parseInline(text: string): Array<{ type: 'text' | 'bold' | 'code'; text: string }> {
  const parts: Array<{ type: 'text' | 'bold' | 'code'; text: string }> = []
  let remaining = text
  while (remaining.length > 0) {
    // 匹配 **bold**
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
    // 匹配 `code`
    const codeMatch = remaining.match(/`(.+?)`/)

    if (boldMatch && (!codeMatch || boldMatch.index! < codeMatch.index!)) {
      if (boldMatch.index! > 0) {
        parts.push({ type: 'text', text: remaining.slice(0, boldMatch.index) })
      }
      parts.push({ type: 'bold', text: boldMatch[1] })
      remaining = remaining.slice(boldMatch.index! + boldMatch[0].length)
    } else if (codeMatch) {
      if (codeMatch.index! > 0) {
        parts.push({ type: 'text', text: remaining.slice(0, codeMatch.index) })
      }
      parts.push({ type: 'code', text: codeMatch[1] })
      remaining = remaining.slice(codeMatch.index! + codeMatch[0].length)
    } else {
      parts.push({ type: 'text', text: remaining })
      remaining = ''
    }
  }
  return parts
}

// ============================================================================
// 建议问题生成（基于 KC 字段）
// ============================================================================

function generateSuggestions(kc: KnowledgeCard): string[] {
  const suggestions: string[] = []

  if (kc.methodology) {
    suggestions.push(`这篇论文的 method 是什么？用通俗语言解释`)
  }
  if (kc.innovation && kc.innovation.length > 0) {
    suggestions.push(`这篇论文的核心创新点是什么？`)
  }
  if (kc.limitations && kc.limitations.length > 0) {
    suggestions.push(`这篇论文有哪些局限性？怎么改进？`)
  }
  if (kc.key_terms && kc.key_terms.length > 0) {
    const term = kc.key_terms[0].term
    suggestions.push(`什么是 "${term}"？为什么重要？`)
  }
  if (kc.future_work && kc.future_work.length > 0) {
    suggestions.push(`作者提到的未来工作是什么？`)
  }
  if (kc.applications && kc.applications.length > 0) {
    suggestions.push(`这篇论文有什么实际应用场景？`)
  }
  if (kc.takeaway) {
    suggestions.push(`用一句话总结这篇论文`)
  }
  if (kc.difficulty === 'Advanced') {
    suggestions.push(`作为一个初学者，我应该先掌握什么前置知识？`)
  }

  // 默认建议
  if (suggestions.length === 0) {
    suggestions.push(`用一句话总结这篇论文的核心贡献`)
    suggestions.push(`这篇论文有什么实际应用场景？`)
    suggestions.push(`如果我要复现这篇论文，关键步骤是什么？`)
    suggestions.push(`这篇论文和当前领域其他工作相比有什么独特之处？`)
  }

  return suggestions.slice(0, 4)
}

// ============================================================================
// 辅助
// ============================================================================

function truncate(s: string, max: number): string {
  if (!s) return ''
  if (s.length <= max) return s
  return s.substring(0, max - 3) + '...'
}

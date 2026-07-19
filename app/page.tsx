'use client'

import { useState, useRef } from 'react'

type InputMode = 'text' | 'url' | 'pdf'

export default function Home() {
  const [mode, setMode] = useState<InputMode>('text')
  const [input, setInput] = useState('')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [markdown, setMarkdown] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async () => {
    if (mode === 'pdf') {
      if (!pdfFile) {
        setError('请上传 PDF 文件')
        return
      }
    } else if (!input.trim()) {
      setError(mode === 'url' ? '请输入 URL' : '请输入论文/文档内容')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)
    setMarkdown('')
    setCopied(false)

    try {
      let response: Response

      if (mode === 'pdf') {
        const formData = new FormData()
        formData.append('file', pdfFile as File)
        formData.append('language', 'zh')
        formData.append('detail_level', 'standard')
        formData.append('export_format', 'markdown')

        response = await fetch('/api/research/upload-pdf', {
          method: 'POST',
          body: formData,
        })
      } else {
        const payload =
          mode === 'url'
            ? { input_type: 'url', url: input, export_format: 'markdown' }
            : { input_type: 'text', content: input, export_format: 'markdown' }

        response = await fetch('/api/research/knowledge-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      const data = await response.json()

      if (!data.success) {
        setError(data.error || '生成失败')
        return
      }

      setResult(data.knowledge_card)
      setMarkdown(data.markdown || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败')
    } finally {
      setLoading(false)
    }
  }

  const copyMarkdown = () => {
    navigator.clipboard.writeText(markdown)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const downloadMarkdown = () => {
    const title = result?.title || 'knowledge-card'
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/[^\w\u4e00-\u9fa5]+/g, '_')}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const loadExample = () => {
    setMode('text')
    setInput(`Attention Is All You Need 是 Google 在 2017 年提出的 Transformer 架构论文。它完全摒弃了 RNN 和 CNN，只用 self-attention 机制处理序列。核心创新是 multi-head attention，让模型能同时关注序列中不同位置的信息。Transformer 在机器翻译任务上达到 SOTA，并成为后续 BERT、GPT 等大语言模型的基础架构。

该论文的主要贡献包括：
1. 提出了完全基于注意力机制的 Transformer 模型
2. 引入了 multi-head attention，让模型能同时关注不同表示子空间的信息
3. 使用 positional encoding 为模型提供位置信息
4. 在 WMT 2014 英语-德语翻译任务上达到 28.4 BLEU，比现有最好结果提升 2 BLEU以上

Transformer 的并行化能力使其训练速度远快于 RNN，为后续大规模预训练模型奠定了基础。`)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #f6f8fc 0%, #e0e7ff 100%)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 20px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔬</div>
          <h1 style={{ fontSize: '36px', fontWeight: 800, margin: 0, background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            ResearchKit
          </h1>
          <p style={{ color: '#5a6478', fontSize: '16px', marginTop: '8px' }}>
            一站式 AI Research Agent · 论文/文档 → 结构化知识卡
          </p>
        </div>

        {/* Input Card */}
        <div style={{ background: 'white', borderRadius: '20px', padding: '28px', boxShadow: '0 4px 20px rgba(99, 102, 241, 0.08)', marginBottom: '24px' }}>
          {/* Mode tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <button
              onClick={() => { setMode('text'); setError('') }}
              style={tabStyle(mode === 'text')}
            >📝 文本输入</button>
            <button
              onClick={() => { setMode('url'); setError('') }}
              style={tabStyle(mode === 'url')}
            >🔗 URL 抓取</button>
            <button
              onClick={() => { setMode('pdf'); setError('') }}
              style={tabStyle(mode === 'pdf')}
            >📄 PDF 上传</button>
          </div>

          {/* Input field */}
          {mode === 'text' && (
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="粘贴论文摘要、技术文档或任意研究内容..."
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = '#6366f1')}
              onBlur={(e) => (e.target.style.borderColor = '#e2e8f2')}
            />
          )}

          {mode === 'url' && (
            <input
              type="url"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="https://arxiv.org/abs/2301.00001 或任意网页链接"
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = '#6366f1')}
              onBlur={(e) => (e.target.style.borderColor = '#e2e8f2')}
            />
          )}

          {mode === 'pdf' && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                const file = e.dataTransfer.files[0]
                if (file && (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf')) {
                  setPdfFile(file)
                  setError('')
                } else {
                  setError('只支持 PDF 文件')
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%',
                minHeight: '180px',
                border: `2px dashed ${dragging ? '#6366f1' : pdfFile ? '#10b981' : '#e2e8f2'}`,
                borderRadius: '12px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                background: dragging ? '#f0f4ff' : pdfFile ? '#f0fdf4' : '#fafbfc',
                transition: 'all 0.2s',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    setPdfFile(file)
                    setError('')
                  }
                }}
              />
              {pdfFile ? (
                <>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>✓</div>
                  <div style={{ fontWeight: 600, color: '#10b981', marginBottom: '4px' }}>{pdfFile.name}</div>
                  <div style={{ fontSize: '13px', color: '#5a6478' }}>{(pdfFile.size / 1024).toFixed(1)} KB · 点击重新选择</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📄</div>
                  <div style={{ fontWeight: 600, color: '#5a6478', marginBottom: '4px' }}>点击上传或拖拽 PDF 到这里</div>
                  <div style={{ fontSize: '13px', color: '#94a3b8' }}>最大 10MB · 支持文字版 PDF</div>
                </>
              )}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px', alignItems: 'center' }}>
            <button
              onClick={handleSubmit}
              disabled={loading}
              style={{
                flex: 1, padding: '14px 24px',
                background: loading ? '#cbd5e1' : 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
                color: 'white', border: 'none', borderRadius: '12px',
                fontSize: '16px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'transform 0.2s', transform: loading ? 'none' : 'scale(1)',
              }}
            >
              {loading ? '⏳ 生成中...' : '✨ 生成知识卡'}
            </button>
            <button
              onClick={loadExample}
              style={{
                padding: '14px 20px', background: '#f1f5f9', color: '#5a6478',
                border: 'none', borderRadius: '12px', cursor: 'pointer',
                fontSize: '14px', fontWeight: 600,
              }}
            >📋 载入示例</button>
          </div>

          {error && (
            <div style={{ marginTop: '16px', padding: '14px 16px', background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '12px', fontSize: '14px' }}>
              ❌ {error}
            </div>
          )}
        </div>

        {/* Result */}
        {result && (
          <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }`}</style>

            {/* Title card */}
            <div style={{ background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)', borderRadius: '20px', padding: '28px', color: 'white', marginBottom: '16px', boxShadow: '0 8px 24px rgba(99, 102, 241, 0.25)' }}>
              <div style={{ fontSize: '14px', opacity: 0.8, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>📖 知识卡</div>
              <h2 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>{result.title}</h2>
            </div>

            {/* Core arguments */}
            {result.core_arguments?.length > 0 && (
              <Card title="💡 核心观点" color="#f59e0b">
                <ol style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.8 }}>
                  {result.core_arguments.map((arg: string, i: number) => (
                    <li key={i} style={{ marginBottom: '8px' }}>{arg}</li>
                  ))}
                </ol>
              </Card>
            )}

            {/* Key terms */}
            {result.key_terms?.length > 0 && (
              <Card title="🔤 关键术语" color="#06b6d4">
                <div style={{ display: 'grid', gap: '12px' }}>
                  {result.key_terms.map((item: any, i: number) => (
                    <div key={i} style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', borderLeft: '3px solid #06b6d4' }}>
                      <div style={{ fontWeight: 700, color: '#0f1729', marginBottom: '4px' }}>{item.term}</div>
                      <div style={{ color: '#5a6478', fontSize: '14px' }}>{item.definition}</div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Methodology */}
            {result.methodology && (
              <Card title="🔧 方法论" color="#10b981">
                <p style={{ margin: 0, lineHeight: 1.8 }}>{result.methodology}</p>
              </Card>
            )}

            {/* Takeaways */}
            {result.actionable_takeaways?.length > 0 && (
              <Card title="✅ 可操作建议" color="#6366f1">
                <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.8 }}>
                  {result.actionable_takeaways.map((item: string, i: number) => (
                    <li key={i} style={{ marginBottom: '6px' }}>{item}</li>
                  ))}
                </ul>
              </Card>
            )}

            {/* References */}
            {result.references?.length > 0 && (
              <Card title="📚 参考文献" color="#8b5cf6">
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#5a6478', lineHeight: 1.8 }}>
                  {result.references.map((ref: string, i: number) => (
                    <li key={i}>{ref}</li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Export toolbar */}
            {markdown && (
              <div style={{ background: 'white', borderRadius: '16px', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', marginTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>📥 导出</h3>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={copyMarkdown} style={btnSecondary}>
                      {copied ? '✓ 已复制' : '📋 复制 Markdown'}
                    </button>
                    <button onClick={downloadMarkdown} style={btnPrimary}>
                      ⬇️ 下载 .md
                    </button>
                  </div>
                </div>
                <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: '16px', borderRadius: '8px', fontSize: '12px', overflow: 'auto', maxHeight: '300px', margin: 0 }}>
                  {markdown}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: '40px', padding: '20px', color: '#94a3b8', fontSize: '13px' }}>
          <strong style={{ color: '#5a6478' }}>ResearchKit v0.2.0</strong> — 一站式 AI Research Agent<br />
          <span style={{ fontSize: '12px' }}>Powered by DeepSeek · Built for OKX.AI Genesis Hackathon</span>
        </div>
      </main>
    </div>
  )
}

function Card({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', marginBottom: '16px', borderLeft: `4px solid ${color}` }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '17px', fontWeight: 700, color: '#0f1729' }}>{title}</h3>
      {children}
    </div>
  )
}

const btnPrimary: React.CSSProperties = {
  padding: '10px 16px',
  background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
  color: 'white',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 600,
}

const btnSecondary: React.CSSProperties = {
  padding: '10px 16px',
  background: '#f1f5f9',
  color: '#5a6478',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 600,
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '10px 16px',
    borderRadius: '10px',
    border: 'none',
    cursor: 'pointer',
    background: active ? 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)' : '#f1f5f9',
    color: active ? 'white' : '#5a6478',
    fontWeight: 600,
    fontSize: '14px',
  }
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '180px',
  padding: '16px',
  border: '2px solid #e2e8f2',
  borderRadius: '12px',
  fontSize: '14px',
  fontFamily: 'inherit',
  resize: 'vertical',
  outline: 'none',
  transition: 'border-color 0.2s',
}

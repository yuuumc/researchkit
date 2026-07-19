'use client'

import { useState } from 'react'

export default function Home() {
  const [content, setContent] = useState('')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!content.trim()) {
      setError('请输入论文/文档内容')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const response = await fetch('/api/research/knowledge-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          options: {
            language: 'zh',
            detail_level: 'standard',
          },
        }),
      })

      const data = await response.json()

      if (!data.success) {
        setError(data.error || '生成失败')
        return
      }

      setResult(data.knowledge_card)
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ maxWidth: '800px', margin: '40px auto', padding: '20px' }}>
      <h1 style={{ fontSize: '28px', marginBottom: '10px' }}>ResearchKit — 知识卡生成器</h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>
        输入论文或技术文档内容，自动生成结构化知识卡
      </p>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
          论文/文档内容：
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="粘贴论文摘要、技术文档或任意文本..."
          style={{
            width: '100%',
            height: '200px',
            padding: '12px',
            border: '1px solid #ddd',
            borderRadius: '8px',
            fontSize: '14px',
            fontFamily: 'inherit',
          }}
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading}
        style={{
          padding: '12px 24px',
          background: loading ? '#ccc' : '#0066ff',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontSize: '16px',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? '生成中...' : '生成知识卡'}
      </button>

      {error && (
        <div style={{ marginTop: '20px', padding: '12px', background: '#fee', color: '#c00', borderRadius: '8px' }}>
          ❌ {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: '30px' }}>
          <h2 style={{ fontSize: '20px', marginBottom: '15px' }}>📊 知识卡</h2>

          <div style={{ background: '#f5f5f5', padding: '20px', borderRadius: '8px', marginBottom: '15px' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#333' }}>📖 {result.title}</h3>
          </div>

          <div style={{ background: '#f5f5f5', padding: '20px', borderRadius: '8px', marginBottom: '15px' }}>
            <h4 style={{ margin: '0 0 10px 0' }}>💡 核心观点</h4>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              {result.core_arguments?.map((arg: string, i: number) => (
                <li key={i} style={{ marginBottom: '5px' }}>{arg}</li>
              ))}
            </ul>
          </div>

          <div style={{ background: '#f5f5f5', padding: '20px', borderRadius: '8px', marginBottom: '15px' }}>
            <h4 style={{ margin: '0 0 10px 0' }}>🔤 关键术语</h4>
            <div style={{ display: 'grid', gap: '8px' }}>
              {result.key_terms?.map((item: any, i: number) => (
                <div key={i} style={{ display: 'flex', gap: '10px' }}>
                  <strong style={{ minWidth: '100px' }}>{item.term}:</strong>
                  <span>{item.definition}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: '#f5f5f5', padding: '20px', borderRadius: '8px', marginBottom: '15px' }}>
            <h4 style={{ margin: '0 0 10px 0' }}>🔧 方法论</h4>
            <p style={{ margin: 0 }}>{result.methodology}</p>
          </div>

          <div style={{ background: '#f5f5f5', padding: '20px', borderRadius: '8px', marginBottom: '15px' }}>
            <h4 style={{ margin: '0 0 10px 0' }}>✅ 可操作建议</h4>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              {result.actionable_takeaways?.map((item: string, i: number) => (
                <li key={i} style={{ marginBottom: '5px' }}>{item}</li>
              ))}
            </ul>
          </div>

          <div style={{ background: '#f5f5f5', padding: '20px', borderRadius: '8px' }}>
            <h4 style={{ margin: '0 0 10px 0' }}>📚 参考文献</h4>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#666' }}>
              {result.references?.map((ref: string, i: number) => (
                <li key={i}>{ref}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div style={{ marginTop: '40px', padding: '15px', background: '#e8f4ff', borderRadius: '8px', fontSize: '13px', color: '#666' }}>
        <strong>ResearchKit v0.1.0</strong> — 一站式 AI Research Agent<br/>
        MVP: 论文/文档 → 结构化知识卡
      </div>
    </main>
  )
}
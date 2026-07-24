'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import KnowledgeGraph, { buildKnowledgeGraph } from '@/components/KnowledgeGraph'
import AgentTimeline from '@/components/AgentTimeline'
import { CompareTab } from '@/components/CompareTab'
import { SmartSuggestionBanner } from '@/components/SmartSuggestionBanner'
import { ChatWithKC } from '@/components/ChatWithKC'
import { ExplainKC } from '@/components/ExplainKC'
import { PluginPanel } from '@/components/PluginPanel'
import { ScrollToTop } from '@/components/ScrollToTop'
import { LiveThoughts, type LiveThought } from '@/components/LiveThoughts'
import { LanguageDetectBanner } from '@/components/LanguageDetectBanner'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { btnPrimary, btnSecondary, tabStyle, inputStyle } from '@/lib/ui-styles'
import { useI18n } from '@/components/I18nProvider'
import { getKcFieldLabels } from '@/lib/ui-labels'
import { appendCostRun } from '@/lib/cost-history'
import { appendKCToHistory, loadKCHistory } from '@/lib/kc-history'
import { computeSmartSuggestion as computeSmartSuggestionHeuristic, type SmartSuggestion } from '@/lib/smart-suggestion'
import { EXAMPLE_FIXTURE } from '@/lib/example-content'  // v2.3.3 (C): 共享「载入示例」固定输入（与缓存键单一事实源）
import {
  getUserPreferencesClient,
  saveUserPreferencesClient,
  type UserPreferences,
} from '@/lib/user-preferences'
import type { Locale } from '@/lib/locale'

type InputMode = 'text' | 'url' | 'pdf' | 'batch'

export default function Home() {
  const { t, resolvedLocale } = useI18n()
  const [mode, setMode] = useState<InputMode>('text')
  const [input, setInput] = useState('')
  const [result, setResult] = useState<any>(null)
  const [batchResults, setBatchResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState<'md' | 'obsidian' | 'mindmap' | null>(null)
  const [markdown, setMarkdown] = useState('')
  const [obsidian, setObsidian] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [showObsidian, setShowObsidian] = useState(false) // 已废弃（用 exportTab 代替），保留避免破坏其他引用
  const [exportTab, setExportTab] = useState<'markdown' | 'obsidian' | 'mindmap' | 'compare'>('markdown')
  const [plan, setPlan] = useState<any>(null)
  const [execution, setExecution] = useState<any[]>([])
  const [reflection, setReflection] = useState<any>(null)
  const [agentMeta, setAgentMeta] = useState<any>(null)
  const [toolCalls, setToolCalls] = useState<any[]>([])
  const [iterations, setIterations] = useState<any[]>([])
  const [totalIterations, setTotalIterations] = useState(0)
  const [uiMode, setUiMode] = useState<'simple' | 'advanced'>('simple')
  const [markdownPreviewOpen, setMarkdownPreviewOpen] = useState(false)
  const [pipelineExpanded, setPipelineExpanded] = useState(false)
  const [mindmap, setMindmap] = useState('')
  const [mindmapSvg, setMindmapSvg] = useState<string | null>(null)
  const [mindmapError, setMindmapError] = useState<string | null>(null)
  const [showMermaidSource, setShowMermaidSource] = useState(false) // 折叠 Mermaid 源码
  const [progressStage, setProgressStage] = useState(0) // 0=未开始, 1-6=各阶段, 7=完成
  const [progressStartedAt, setProgressStartedAt] = useState<number>(0)
  const [, setTick] = useState(0) // 用于强制 re-render 更新进度面板"已耗时"
  // D9 Memory v1 — Smart Suggestion banner
  const [smartSuggestion, setSmartSuggestion] = useState<SmartSuggestion | null>(null)
  const [suggestionDismissed, setSuggestionDismissed] = useState(false)
  // D9 — Compare tab 预选触发器（Smart Suggestion "Compare Now" 跳转用）
  const [comparePreselectId, setComparePreselectId] = useState<string | null>(null)
  const [comparePreselectTrigger, setComparePreselectTrigger] = useState(0)
  // D28 — Live Thoughts token 流式（用 ref 累积 + throttle setState，避免每个 token 触发 re-render）
  const [liveThoughts, setLiveThoughts] = useState<LiveThought[]>([])
  const [liveThoughtsActive, setLiveThoughtsActive] = useState(false)
  const liveThoughtsBufferRef = useRef<Map<string, string>>(new Map())
  const liveThoughtsFlushTimerRef = useRef<number | null>(null)
  // D39 — User Preferences (用于 LanguageDetectBanner 的 appLocale/outputLocale + 应用建议)
  const [userPrefs, setUserPrefs] = useState<UserPreferences | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mindmapRef = useRef<HTMLDivElement>(null)

  // v2.3.1 KG flicker fix — 用 useMemo 稳定 buildKnowledgeGraph(result) 的数组引用
  // 旧实现 inline 调用 buildKnowledgeGraph(result)，每次 page.tsx re-render
  // (LiveThoughts 60ms flush / SSE 事件 / tab 切换) 都会创建新数组引用 →
  // KnowledgeGraph 组件 re-render → React 重写 <style> innerHTML →
  // 浏览器重新应用 @keyframes → animation 重启 → 节点反复闪烁抖动
  // useMemo 后，只有 result 变化时才重新计算，引用稳定，KnowledgeGraph 不再无谓 re-render
  const knowledgeGraphTree = useMemo(
    () => (result ? buildKnowledgeGraph(result) : []),
    [result]
  )

  // D39 — 首次加载 UserPreferences(客户端 hydration 后)
  useEffect(() => {
    setUserPrefs(getUserPreferencesClient())
  }, [])

  // D39 — LanguageDetectBanner 应用建议:切换 outputLocale 并保存
  const handleApplyLanguageSuggestion = (suggested: Locale) => {
    const current = userPrefs || getUserPreferencesClient()
    const updated: UserPreferences = { ...current, outputLocale: suggested }
    saveUserPreferencesClient(updated)
    setUserPrefs(updated)
  }

  // 进度面板"已耗时"实时刷新：每秒强制 re-render
  useEffect(() => {
    if (progressStage === 0 || progressStage === 7) return
    const interval = window.setInterval(() => setTick(prev => prev + 1), 1000)
    return () => window.clearInterval(interval)
  }, [progressStage])

  // 进度阶段定义 — 与 coordinator.ts 实际执行流程一致
  const STAGES = [
    { id: 1, label: t('home.progress.stage1Label'), icon: '📄', desc: t('home.progress.stage1Desc') },
    { id: 2, label: t('home.progress.stage2Label'), icon: '🧠', desc: t('home.progress.stage2Desc') },
    { id: 3, label: t('home.progress.stage3Label'), icon: '🔬', desc: t('home.progress.stage3Desc') },
    { id: 4, label: t('home.progress.stage4Label'), icon: '🏗️', desc: t('home.progress.stage4Desc') },
    { id: 5, label: t('home.progress.stage5Label'), icon: '🔁', desc: t('home.progress.stage5Desc') },
    { id: 6, label: t('home.progress.stage6Label'), icon: '📤', desc: t('home.progress.stage6Desc') },
  ]

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (mode === 'pdf') {
      if (!pdfFile) {
        setError(t('home.errors.noPdf'))
        return
      }
    } else if (mode === 'batch') {
      if (!input.trim()) {
        setError(t('home.errors.noInputBatch'))
        return
      }
    } else if (!input.trim()) {
      setError(mode === 'url' ? t('home.errors.noInputUrl') : t('home.errors.noInputText'))
      return
    }

    setLoading(true)
    setError('')
    setResult(null)
    setBatchResults([])
    setMarkdown('')
    setObsidian('')
    setMindmap('')
    setMindmapSvg(null)
    setMindmapError(null)
    setExportTab('markdown')
    setCopied(null)
    setPlan(null)
    setExecution([])
    setReflection(null)
    setAgentMeta(null)
    setToolCalls([])
    setIterations([])
    setTotalIterations(0)
    setUiMode('simple')
    setMarkdownPreviewOpen(false)
    setPipelineExpanded(false)
    // D9 — 重置 Smart Suggestion 状态
    setSmartSuggestion(null)
    setSuggestionDismissed(false)
    setComparePreselectId(null)
    // D28 — 重置 Live Thoughts
    setLiveThoughts([])
    setLiveThoughtsActive(true)
    liveThoughtsBufferRef.current = new Map()
    if (liveThoughtsFlushTimerRef.current !== null) {
      window.clearTimeout(liveThoughtsFlushTimerRef.current)
      liveThoughtsFlushTimerRef.current = null
    }

    // 启动可视化进度 — Stage 1 立即触发（Document Loaded）
    // 后续 Stage 2-7 由 SSE 实时推送（/api/research/multi-agent-stream）
    setProgressStage(1)
    setProgressStartedAt(Date.now())
    // 标记是否已完成（避免重复 set）
    let finalized = false
    const finalizeProgress = () => {
      if (finalized) return
      finalized = true
      setProgressStage(7) // 全部完成
      window.setTimeout(() => setProgressStage(0), 800)
    }

    try {
      if (mode === 'pdf') {
        // PDF 走 upload-pdf（先解析 PDF，再调 LLM）
        const formData = new FormData()
        formData.append('file', pdfFile as File)
        formData.append('language', 'zh')
        formData.append('detail_level', 'standard')
        formData.append('export_format', 'markdown')

        const pdfResponse = await fetch('/api/research/upload-pdf', {
          method: 'POST',
          body: formData,
        })
        const pdfData = await pdfResponse.json()
        if (!pdfData.success) {
          setError(pdfData.error || t('home.errors.pdfParseFailed'))
          setProgressStage(0)
          return
        }
        setResult(pdfData.knowledge_card)
        setMarkdown(pdfData.markdown || '')
        setObsidian(pdfData.obsidian || '')
        setMindmap(pdfData.mindmap || '')

        // v2.3.3 fix — PDF 模式也写 cost history
        const pdfMeta = pdfData.metadata || {}
        const pdfPerAgent = Array.isArray(pdfMeta.per_agent_usage) ? pdfMeta.per_agent_usage : []
        if (pdfMeta.total_tokens > 0 && pdfPerAgent.length > 0 && pdfData.knowledge_card) {
          try {
            await appendCostRun({
              timestamp: Date.now(),
              title: String(pdfData.knowledge_card.title || '').substring(0, 60),
              source: String(pdfMeta.source || 'PDF 上传'),
              inputType: 'pdf',
              complexity: '',
              totalDurationMs: Number(pdfMeta.processing_time_ms || 0),
              totalUsage: {
                promptTokens: Number(pdfMeta.total_prompt_tokens || 0),
                completionTokens: Number(pdfMeta.total_completion_tokens || 0),
                totalTokens: Number(pdfMeta.total_tokens || 0),
              },
              totalCostUsd: Number(pdfMeta.total_cost_usd || 0),
              perAgent: pdfPerAgent,
              model: pdfMeta.model || undefined,
            })
          } catch (err) {
            console.warn('[cost-history] PDF append failed:', err)
          }
        }

        finalizeProgress()
        setLoading(false)
        return
      }

      // batch 模式不支持 SSE（每条 URL 各自走 multi-agent，进度难以聚合）
      if (mode === 'batch') {
        const urls = input.split('\n').map(u => u.trim()).filter(u => u.length > 0)
        const response = await fetch('/api/research/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls, concurrency: 3 }),
        })
        const data = await response.json()
        if (!data.success) {
          setError(data.error || t('home.errors.generateFailed'))
          setProgressStage(0)
          return
        }
        setBatchResults(data.results || [])

        // v2.3.3 fix — batch 模式也写 cost history(聚合所有 URL)
        const batchMeta = data.metadata || {}
        const batchPerAgent = Array.isArray(batchMeta.per_agent_usage) ? batchMeta.per_agent_usage : []
        const successCount = (data.results || []).filter((r: any) => r.success).length
        if (batchMeta.total_tokens > 0 && batchPerAgent.length > 0 && successCount > 0) {
          try {
            await appendCostRun({
              timestamp: Date.now(),
              title: `Batch x${successCount} (${String(urls[0] || '').substring(0, 30)}...)`,
              source: 'batch',
              inputType: 'batch',
              complexity: '',
              totalDurationMs: Number(batchMeta.processing_time_ms || 0),
              totalUsage: {
                promptTokens: Number(batchMeta.total_prompt_tokens || 0),
                completionTokens: Number(batchMeta.total_completion_tokens || 0),
                totalTokens: Number(batchMeta.total_tokens || 0),
              },
              totalCostUsd: Number(batchMeta.total_cost_usd || 0),
              perAgent: batchPerAgent,
              model: batchMeta.model || undefined,
            })
          } catch (err) {
            console.warn('[cost-history] batch append failed:', err)
          }
        }

        finalizeProgress()
        return
      }

      // text / url 模式：用 SSE 订阅真实进度
      let actualContent = input
      let actualSource: string = '用户输入'
      let actualTitle: string | undefined = undefined

      if (mode === 'url') {
        // URL 模式：先抓取 URL 内容，再走 SSE
        const fetchResponse = await fetch('/api/research/fetch-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: input }),
        })
        const fetchData = await fetchResponse.json()
        if (!fetchData.success) {
          setError(fetchData.error || t('home.errors.urlFetchFailed'))
          setProgressStage(0)
          return
        }
        if (!fetchData.content || fetchData.content.length < 50) {
          setError(t('home.errors.urlTooShort', { len: fetchData.content?.length || 0 }))
          setProgressStage(0)
          return
        }
        // parser.ts 的 fetchFromUrl 已将内容截断到 30000 字符，此处无需再截断
        actualContent = fetchData.content
        actualSource = input
        actualTitle = fetchData.title
      }

      // 用 fetch + ReadableStream 接收 SSE（EventSource 不支持 POST，所以手动解析）
      const sseResponse = await fetch('/api/research/multi-agent-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
        body: JSON.stringify({ content: actualContent, source: actualSource, title: actualTitle }),
      }).catch((fetchErr: Error) => {
        // 网络层错误（如 ERR_ABORTED, ERR_CONNECTION_REFUSED）— 抛出友好消息给 catch 块
        const msg = String(fetchErr?.message || fetchErr)
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('ABORTED')) {
          throw new Error(t('home.errors.networkInterrupted'))
        }
        throw fetchErr
      })

      if (!sseResponse.ok || !sseResponse.body) {
        const errText = await sseResponse.text()
        setError(t('home.errors.sseFailed', { status: sseResponse.status, detail: errText }))
        setProgressStage(0)
        return
      }

      // 手动解析 SSE 流
      const reader = sseResponse.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finalData: any = null

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // SSE 消息以 \n\n 分隔
          let idx: number
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const rawMsg = buffer.slice(0, idx)
            buffer = buffer.slice(idx + 2)

            // 解析 event: xxx \n data: yyy
            const lines = rawMsg.split('\n')
            let eventName = 'message'
            const dataLines: string[] = []
            for (const line of lines) {
              if (line.startsWith('event: ')) eventName = line.slice(7)
              else if (line.startsWith('data: ')) dataLines.push(line.slice(6))
            }
            if (dataLines.length === 0) continue

            // JSON.parse 失败时跳过这条消息（不中断整个流）
            let payload: any
            try {
              payload = JSON.parse(dataLines.join('\n'))
            } catch (err) {
              console.warn('SSE JSON parse failed, skipping:', err)
              continue
            }

            if (eventName === 'stage') {
              // 真实后端进度更新
              setProgressStage(payload.id)
              if (payload.id === 7) {
                // Done — 800ms 后隐藏面板
                window.setTimeout(() => setProgressStage(0), 800)
              }
            } else if (eventName === 'result') {
              finalData = payload
            } else if (eventName === 'error') {
              setError(payload.error || t('home.errors.generateFailed'))
              setProgressStage(0)
              return
            } else if (eventName === 'agent_token') {
              // D28 — token 流式：累积到 ref，throttle 触发 setState
              const { agent, delta } = payload as { agent: string; delta: string }
              const buf = liveThoughtsBufferRef.current
              buf.set(agent, (buf.get(agent) || '') + delta)
              // 每 60ms flush 一次（避免每个 token 触发 re-render）
              if (liveThoughtsFlushTimerRef.current === null) {
                liveThoughtsFlushTimerRef.current = window.setTimeout(() => {
                  liveThoughtsFlushTimerRef.current = null
                  const arr: LiveThought[] = Array.from(liveThoughtsBufferRef.current.entries())
                    .map(([agent, text]) => ({ agent, text }))
                  setLiveThoughts(arr)
                }, 60)
              }
            }
          }
        }
      } catch (streamErr) {
        // 流读取过程中被中断
        // 可能原因：
        //   1. 用户主动操作（页面刷新、切换路由、关闭 tab）→ aborted
        //   2. Vercel function timeout（10s/60s/300s 视 plan）→ connection reset
        //   3. DeepSeek API 偶发网络抖动 → stream chunk 中断
        //   4. 后端主动发 error 事件后 close → 但前端已收到 error 事件并 return，不会进这里
        // 如果 finalData 已经有部分数据，提示用户重试而非清空
        const msg = String(streamErr instanceof Error ? streamErr.message : streamErr)
        console.error('[SSE stream] 读取中断:', { msg, hasPartialData: !!finalData })
        if (msg.includes('aborted') || msg.includes('ABORTED') || msg.includes('network') || msg.includes('Failed to fetch')) {
          throw new Error(t('home.errors.streamInterrupted'))
        }
        throw streamErr
      } finally {
        try { reader.releaseLock() } catch {}
      }

      if (!finalData || !finalData.success || !finalData.knowledge_card) {
        setError(finalData?.error || t('home.errors.incompleteData'))
        setProgressStage(0)
        return
      }

      setResult(finalData.knowledge_card)
      setMarkdown(finalData.markdown || '')
      setObsidian(finalData.obsidian || '')
      setMindmap(finalData.mindmap || '')
      setPlan(finalData.plan || null)
      setExecution(finalData.execution || [])
      setReflection(finalData.reflection || null)
      setAgentMeta(finalData.metadata || null)
      setToolCalls(finalData.tool_calls || [])
      setIterations(finalData.iterations || [])
      setTotalIterations(finalData.total_iterations || 0)

      // D34 — KC 生成完成后自动滚动到结果区（demo 友好）
      setTimeout(() => {
        document.getElementById('result-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 200)

      // D6 Cost Dashboard — 持久化到 server-side（D29 改造）
      // 只在确实生成了知识卡 + 有 token 统计时记录（避免失败请求污染历史）
      const md = finalData.metadata || {}
      const perAgent = Array.isArray(md.per_agent_usage) ? md.per_agent_usage : []
      // v2.3.3 (C): 缓存回放不消耗真实 token/cost，跳过 cost history 写入避免重复计数
      const isExampleReplay = !!(md as any).example_replay?.cacheHit
      if (md.total_tokens > 0 && perAgent.length > 0 && finalData.knowledge_card && !isExampleReplay) {
        try {
          await appendCostRun({
            timestamp: Date.now(),
            title: String(finalData.knowledge_card.title || '').substring(0, 60),
            source: String(finalData.metadata?.source || actualSource || '用户输入'),
            inputType: String(finalData.plan?.input_type || ''),
            complexity: String(finalData.plan?.complexity || ''),
            totalDurationMs: Number(md.total_duration_ms || 0),
            totalUsage: {
              promptTokens: Number(md.total_prompt_tokens || 0),
              completionTokens: Number(md.total_completion_tokens || 0),
              totalTokens: Number(md.total_tokens || 0),
            },
            totalCostUsd: Number(md.total_cost_usd || 0),
            perAgent,
            model: perAgent[0]?.model || undefined,
          })
        } catch (err) {
          // server-side 写失败不影响主流程
          console.warn('[cost-history] append failed:', err)
        }
      }

      // D8 Compare Papers — 把当前 KC 追加到历史（供 CompareTab 选另一篇对比）
      // D29 — 改为 server-side 持久化
      // 只在确实生成了知识卡时记录（避免失败请求污染历史）
      if (finalData.knowledge_card) {
        try {
          await appendKCToHistory({
            knowledgeCard: finalData.knowledge_card,
            source: String(actualSource || '用户输入'),
          })
        } catch (err) {
          console.warn('[kc-history] append failed:', err)
        }

        // D9/D30 Smart Suggestion — 改用 LLM v2 判断（server-side API），失败 fallback 到 v1 启发式
        try {
          const history = await loadKCHistory()
          // 排除刚加入的当前 KC（按 title+year 比较）
          const filteredHistory = history.filter(e => {
            const sameTitle = e.title === String(finalData.knowledge_card.title || '').substring(0, 80)
            const sameYear = e.year === finalData.knowledge_card.year
            return !(sameTitle && sameYear)
          })

          let suggestion: SmartSuggestion | null = null
          try {
            // D30 — 优先调 LLM v2 API
            const res = await fetch('/api/research/smart-suggestion', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                currentKC: finalData.knowledge_card,
                history: filteredHistory,
              }),
            })
            if (res.ok) {
              suggestion = (await res.json()) as SmartSuggestion
            }
          } catch (llmErr) {
            console.warn('[smart-suggestion] LLM API failed:', llmErr)
          }

          // Fallback：LLM 调用失败时用 v1 启发式
          if (!suggestion) {
            suggestion = computeSmartSuggestionHeuristic(finalData.knowledge_card, filteredHistory)
          }

          if (suggestion.bestMatch) {
            setSmartSuggestion(suggestion)
            setSuggestionDismissed(false)
          }
        } catch (err) {
          console.warn('[smart-suggestion] compute failed:', err)
        }
      }

      finalizeProgress()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('home.errors.requestFailed'))
      setProgressStage(0)
    } finally {
      setLoading(false)
      // D28 — 关闭 Live Thoughts 浮窗 active 状态（最后一批 token flush + 2.5s 后自动隐藏）
      if (liveThoughtsFlushTimerRef.current !== null) {
        window.clearTimeout(liveThoughtsFlushTimerRef.current)
        liveThoughtsFlushTimerRef.current = null
      }
      const finalArr: LiveThought[] = Array.from(liveThoughtsBufferRef.current.entries())
        .map(([agent, text]) => ({ agent, text }))
      if (finalArr.length > 0) setLiveThoughts(finalArr)
      setLiveThoughtsActive(false)
    }
  }

  const copyMarkdown = (format: 'md' | 'obsidian' | 'mindmap') => {
    const content = format === 'md' ? markdown : format === 'obsidian' ? obsidian : mindmap
    // 用 try/catch 处理 clipboard 权限拒绝/非 HTTPS 等场景
    const fallbackCopy = () => {
      try {
        const textarea = document.createElement('textarea')
        textarea.value = content
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
        return true
      } catch (e) {
        return false
      }
    }
    const ok = (() => {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(content).catch(() => {
            // 异步拒绝时回退
            if (!fallbackCopy()) {
              setError(t('home.errors.copyFailed'))
              setTimeout(() => setError(''), 3000)
            }
          })
          return true
        }
        return fallbackCopy()
      } catch {
        return fallbackCopy()
      }
    })()
    if (ok) {
      setCopied(format)
      setTimeout(() => setCopied(null), 2000)
    }
  }

  const downloadMarkdown = (format: 'md' | 'obsidian' | 'mindmap') => {
    const content = format === 'md' ? markdown : format === 'obsidian' ? obsidian : mindmap
    const ext = format === 'mindmap' ? 'mmd' : 'md'
    const prefix = format === 'md' ? '' : format === 'obsidian' ? 'obsidian-' : 'mindmap-'
    const title = result?.title || 'knowledge-card'
    const blob = new Blob([content], { type: format === 'mindmap' ? 'text/plain;charset=utf-8' : 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${prefix}${title.replace(/[^\w\u4e00-\u9fa5]+/g, '_')}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Mermaid 渲染：mindmap 内容变化时重新渲染
  useEffect(() => {
    if (!mindmap || exportTab !== 'mindmap') {
      setMindmapSvg(null)
      setMindmapError(null)
      return
    }

    let cancelled = false

    const renderMermaid = async () => {
      try {
        setMindmapError(null)
        // 动态加载 mermaid（仅在需要时）
        const w = window as any
        if (!w.mermaid) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script')
            script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js'
            script.async = true
            script.onload = () => resolve()
            script.onerror = () => reject(new Error(t('home.errors.mermaidCdnFailed')))
            document.head.appendChild(script)
          })
        }
        const mermaid = w.mermaid
        mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          themeVariables: {
            primaryColor: '#ede9fe',
            primaryTextColor: '#4c1d95',
            primaryBorderColor: '#7c3aed',
            lineColor: '#a78bfa',
            fontSize: '14px',
          },
        })

        // 用唯一 id 避免重复渲染
        const id = `mindmap-${Date.now()}`
        const { svg } = await mermaid.render(id, mindmap)
        if (!cancelled) {
          setMindmapSvg(svg)
        }
      } catch (err) {
        if (!cancelled) {
          setMindmapSvg(null)
          setMindmapError(err instanceof Error ? err.message : t('home.errors.mermaidRenderFailed'))
        }
      }
    }

    renderMermaid()

    return () => {
      cancelled = true
    }
  }, [mindmap, exportTab])

  const loadExample = () => {
    setMode('text')
    // v2.3.3 (C): 从 lib/example-content 共享常量取，与缓存 hash / precompute 脚本保持单一事实源
    setInput(EXAMPLE_FIXTURE.content)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f6f8fc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* === Hero animations CSS === */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
        @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.05); opacity: 0.85; } }
        @keyframes flowDot {
          0% { left: 0%; opacity: 0; transform: scale(0.5); }
          10% { opacity: 1; transform: scale(1); }
          90% { opacity: 1; transform: scale(1); }
          100% { left: 100%; opacity: 0; transform: scale(0.5); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes orbit {
          0% { transform: rotate(0deg) translateX(36px) rotate(0deg); }
          100% { transform: rotate(360deg) translateX(36px) rotate(-360deg); }
        }
        @keyframes typing {
          from { width: 0; }
          to { width: 100%; }
        }
        @keyframes blink { 50% { opacity: 0; } }

        .hero-fade-up { animation: fadeInUp 0.7s ease-out both; }
        .hero-fade-delay-1 { animation: fadeInUp 0.7s ease-out 0.15s both; }
        .hero-fade-delay-2 { animation: fadeInUp 0.7s ease-out 0.3s both; }
        .hero-fade-delay-3 { animation: fadeInUp 0.7s ease-out 0.45s both; }
        .hero-fade-delay-4 { animation: fadeInUp 0.7s ease-out 0.6s both; }
        .hero-fade-delay-5 { animation: fadeInUp 0.7s ease-out 0.75s both; }

        .hero-float { animation: float 4s ease-in-out infinite; }
        .hero-pulse { animation: pulse 2.5s ease-in-out infinite; }

        .shimmer-text {
          background: linear-gradient(90deg, #6366f1 0%, #06b6d4 25%, #8b5cf6 50%, #06b6d4 75%, #6366f1 100%);
          background-size: 200% auto;
          background-clip: text;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimmer 4s linear infinite;
        }

        .flow-track {
          position: relative;
          width: 100%;
          height: 4px;
          background: #e0e7ff;
          border-radius: 2px;
          overflow: visible;
          margin: 16px 0;
        }
        .flow-dot {
          position: absolute;
          top: 50%;
          width: 12px;
          height: 12px;
          background: linear-gradient(135deg, #6366f1, #06b6d4);
          border-radius: 50%;
          box-shadow: 0 0 16px rgba(99, 102, 241, 0.6);
          transform: translateY(-50%);
          animation: flowDot 3s ease-in-out infinite;
        }
        .flow-dot-2 { animation-delay: 1s; }
        .flow-dot-3 { animation-delay: 2s; }

        .agent-card {
          transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
          cursor: default;
        }
        /* hover 时的彩色光晕（基于卡片自己的 borderLeft 颜色，用 currentColor 不可行 → 用伪元素叠色） */
        .agent-card::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.06) 0%, rgba(6, 182, 212, 0.06) 100%);
          opacity: 0;
          transition: opacity 0.3s ease;
          pointer-events: none;
        }
        .agent-card::after {
          /* 顶部扫光效果 */
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 60%;
          height: 100%;
          background: linear-gradient(120deg, transparent 0%, rgba(255, 255, 255, 0.4) 50%, transparent 100%);
          transition: left 0.7s ease;
          pointer-events: none;
        }
        .agent-card:hover {
          transform: translateY(-6px) scale(1.03);
          box-shadow: 0 16px 32px rgba(99, 102, 241, 0.18), 0 0 0 1px rgba(99, 102, 241, 0.1);
          border-left-width: 5px;
        }
        .agent-card:hover::before { opacity: 1; }
        .agent-card:hover::after { left: 120%; }

        .typing-text {
          display: inline-block;
          overflow: hidden;
          white-space: nowrap;
          border-right: 2px solid #6366f1;
          animation: typing 3s steps(40, end) 1s both, blink 0.7s step-end infinite;
        }

        /* === 全局交互动效（不破坏业务逻辑，纯 CSS 增强） === */

        /* 通用按钮：hover 抬升 + 阴影 + 微缩 */
        button {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
        }
        button:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
        }
        button:active:not(:disabled) {
          transform: translateY(0) scale(0.97);
          box-shadow: 0 2px 6px rgba(99, 102, 241, 0.15);
        }
        /* 按钮点击波纹效果 */
        button::after {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 0;
          height: 0;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.5);
          transform: translate(-50%, -50%);
          transition: width 0.6s ease, height 0.6s ease;
          pointer-events: none;
        }
        button:active::after {
          width: 200px;
          height: 200px;
          transition: 0s;
        }

        /* 输入框聚焦：边框流动 + 发光 */
        input:focus, textarea:focus {
          border-color: #6366f1 !important;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1), 0 0 12px rgba(99, 102, 241, 0.15) !important;
        }

        /* 知识卡字段卡片：hover 丰富动效（抬升 + 光晕 + 扫光 + 色条变粗） */
        .hoverable-card {
          transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
        }
        /* 彩色叠层（hover 时浮现） */
        .hoverable-card::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(6, 182, 212, 0.05) 100%);
          opacity: 0;
          transition: opacity 0.3s ease;
          pointer-events: none;
          z-index: 0;
        }
        /* 顶部扫光效果 */
        .hoverable-card::after {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 60%;
          height: 100%;
          background: linear-gradient(120deg, transparent 0%, rgba(255, 255, 255, 0.5) 50%, transparent 100%);
          transition: left 0.8s ease;
          pointer-events: none;
          z-index: 0;
        }
        .hoverable-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 16px 32px rgba(99, 102, 241, 0.15), 0 0 0 1px rgba(99, 102, 241, 0.08);
          border-left-width: 6px !important;
        }
        .hoverable-card:hover::before { opacity: 1; }
        .hoverable-card:hover::after { left: 120%; }
        /* hover 时标题文字轻微右移 + 颜色加深 */
        .hoverable-card:hover > button > h3 {
          transform: translateX(4px);
          color: #4338ca !important;
          transition: all 0.3s ease;
        }
        .hoverable-card > button > h3 {
          transition: all 0.3s ease;
        }
        /* hover 时箭头颜色变深 */
        .hoverable-card:hover > button > span {
          color: #6366f1 !important;
          transition: color 0.3s ease;
        }
        .hoverable-card > button > span {
          transition: color 0.3s ease;
        }
        /* 让 children 在伪元素之上 */
        .hoverable-card > button,
        .hoverable-card > div {
          position: relative;
          z-index: 1;
        }

        /* 模式切换按钮：被选中时弹簧动画 */
        .mode-tab-active {
          animation: tab-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes tab-pop {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }

        /* Hero chip：交错浮动 */
        .hero-chip {
          animation: chip-float 3s ease-in-out infinite;
        }
        .hero-chip:nth-child(2) { animation-delay: 0.2s; }
        .hero-chip:nth-child(3) { animation-delay: 0.4s; }
        .hero-chip:nth-child(4) { animation-delay: 0.6s; }
        .hero-chip:nth-child(5) { animation-delay: 0.8s; }
        .hero-chip:nth-child(6) { animation-delay: 1.0s; }
        @keyframes chip-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }

        /* 进度阶段项：滑入 + 高亮闪动 */
        .stage-item {
          animation: stage-slide-in 0.5s cubic-bezier(0.4, 0, 0.2, 1) both;
        }
        @keyframes stage-slide-in {
          from { opacity: 0; transform: translateX(-12px); }
          to { opacity: 1; transform: translateX(0); }
        }

        /* Accordion 展开/收起过渡（用 max-height 模拟） */
        .accordion-body {
          overflow: hidden;
          transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease;
        }

        /* 知识卡字段：渐入动画（按顺序） */
        .card-field-enter {
          animation: field-fade-up 0.5s ease-out both;
        }
        @keyframes field-fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Logo 长按呼吸（覆盖原 hero-pulse，更柔和） */
        .logo-breath {
          animation: logo-breath 3.5s ease-in-out infinite;
        }
        @keyframes logo-breath {
          0%, 100% { transform: scale(1); box-shadow: 0 12px 32px rgba(99, 102, 241, 0.35); }
          50% { transform: scale(1.04); box-shadow: 0 16px 40px rgba(99, 102, 241, 0.5); }
        }

        /* Title 微弱发光脉冲（在彩色背景上仍清晰可见） */
        .title-glow {
          animation: title-glow 3s ease-in-out infinite;
        }
        @keyframes title-glow {
          0%, 100% { text-shadow: 0 0 8px rgba(255,255,255,0.3), 0 2px 4px rgba(0,0,0,0.2); }
          50% { text-shadow: 0 0 20px rgba(255,255,255,0.6), 0 4px 8px rgba(0,0,0,0.3); }
        }

        /* Copy 按钮成功反馈：脉冲绿 */
        .copy-success {
          animation: copy-pulse 0.6s ease-out;
        }
        @keyframes copy-pulse {
          0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.5); }
          100% { box-shadow: 0 0 0 12px rgba(16, 185, 129, 0); }
        }

        /* 错误提示震动 */
        .error-shake {
          animation: shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
        }
        @keyframes shake {
          10%, 90% { transform: translateX(-1px); }
          20%, 80% { transform: translateX(2px); }
          30%, 50%, 70% { transform: translateX(-3px); }
          40%, 60% { transform: translateX(3px); }
        }

        /* Cap matrix card：hover 时显示渐变光晕 */
        .cap-card {
          position: relative;
          transition: all 0.3s ease;
        }
        .cap-card::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(6, 182, 212, 0.08) 100%);
          opacity: 0;
          transition: opacity 0.3s ease;
          pointer-events: none;
        }
        .cap-card:hover::before { opacity: 1; }
        .cap-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 16px 32px rgba(99, 102, 241, 0.15);
        }

        /* Pipeline 单行 summary chip：hover 时变亮 */
        .pipeline-chip {
          transition: all 0.2s ease;
        }
        .pipeline-chip:hover {
          transform: scale(1.08);
          filter: brightness(1.15);
        }

        /* Knowledge Graph branch：hover 时颜色加深 */
        .kg-branch-hover {
          transition: all 0.2s ease;
        }
        .kg-branch-hover:hover {
          transform: translateX(3px);
          filter: brightness(1.1);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
        }

        /* Footer / 输入区隔层：淡入 */
        .section-fade-in {
          animation: section-fade-in 0.6s ease-out both;
        }
        @keyframes section-fade-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* === D20 KC 生成成功庆祝动效 === */
        /* KC title card 入场：从 scale 0.95 + 模糊 → 清晰，配合 staggered card-field-enter 形成视觉爆点 */
        .kc-success-enter {
          animation: kc-success-enter 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        @keyframes kc-success-enter {
          0% { opacity: 0; transform: scale(0.94); filter: blur(4px); }
          60% { opacity: 1; filter: blur(0); }
          100% { opacity: 1; transform: scale(1); filter: blur(0); }
        }
        /* 顶部彩带粒子（纯 CSS 实现，无 JS 依赖） */
        .success-burst {
          position: fixed;
          top: 0; left: 0; right: 0;
          height: 4px;
          background: linear-gradient(90deg, transparent 0%, #10b981 30%, #06b6d4 50%, #6366f1 70%, transparent 100%);
          animation: success-sweep 0.9s ease-out forwards;
          pointer-events: none;
          z-index: 9999;
          transform-origin: center;
        }
        @keyframes success-sweep {
          0% { transform: scaleX(0); opacity: 0; }
          40% { transform: scaleX(1); opacity: 1; }
          100% { transform: scaleX(1); opacity: 0; }
        }

        /* === D20 移动端响应式 === */
        /* 小屏（< 640px）优化：评委在手机上也能看清 */
        @media (max-width: 640px) {
          /* 主容器 padding 收紧 */
          main { padding: 20px 12px !important; }
          /* Hero 标题缩小，避免溢出 */
          h1 { font-size: 26px !important; }
          /* 输入卡 padding 收紧 */
          .input-card { padding: 16px !important; }
          /* 输入框高度降低 */
          textarea, input[type="url"] { min-height: 100px !important; font-size: 14px !important; }
          /* KC title card 标题字号缩小 */
          .kc-title { font-size: 18px !important; padding: 16px !important; }
          /* Cap matrix 网格强制单列 */
          .cap-grid { grid-template-columns: 1fr !important; }
          /* Agent / Tool 卡片 padding 收紧 */
          .agent-card { padding: 10px !important; }
          /* 按钮全宽 + 高度 ≥ 44px 触摸友好 */
          .action-row { flex-direction: column !important; gap: 8px !important; }
          .action-row > button { width: 100%; min-height: 44px; padding: 12px 16px !important; }
          /* 进度面板 padding 收紧 */
          .progress-panel { padding: 16px !important; }
          /* Settings 浮动入口靠下（避免遮挡 header） */
          .settings-fab { top: 12px !important; right: 12px !important; }
          /* Knowledge Graph 字号缩小 */
          .kg-tree { font-size: 12px !important; }
          /* Export tabs 横向滚动 */
          .export-tabs { overflow-x: auto; flex-wrap: nowrap !important; }
          .export-tabs > button { white-space: nowrap; }
        }

        /* 中等屏（641-768px）轻度调整 */
        @media (max-width: 768px) and (min-width: 641px) {
          .cap-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }

        /* === v2.2.6 hotfix: Smart Suggestion Banner 移动端响应式 === */
        /* 原始 banner minWidth 220 + 按钮 140 + padding 32 = 392px，在 320px viewport 溢出 */
        @media (max-width: 640px) {
          .smart-suggestion-wrapper > div {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 8px !important;
            padding: 12px !important;
          }
          .smart-suggestion-wrapper > div > div:nth-child(2) {
            /* 内容区 */
            min-width: 0 !important;
          }
          .smart-suggestion-wrapper > div > div:last-child {
            /* 按钮区 */
            width: 100% !important;
            justify-content: stretch !important;
          }
          .smart-suggestion-wrapper > div > div:last-child > button {
            flex: 1;
            min-height: 44px;
            padding: 10px 12px !important;
          }
        }
      `}} />

      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 20px' }}>
        {/* === Settings 浮动入口（右上角） === */}
        <a
          href="/settings"
          aria-label="Settings"
          className="settings-fab"
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: 'white',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            textDecoration: 'none',
            zIndex: 1000,
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            border: '1px solid #e2e8f2',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'scale(1.05)'
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(99, 102, 241, 0.2)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'scale(1)'
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
          }}
          title="Settings"
        >
          ⚙️
        </a>
        {/* === HERO === */}
        <div style={{ textAlign: 'center', marginBottom: '48px', position: 'relative' }}>
          {/* Floating background blobs */}
          <div style={{
            position: 'absolute',
            top: '-20px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '320px',
            height: '320px',
            background: 'radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%)',
            borderRadius: '50%',
            zIndex: 0,
            pointerEvents: 'none',
          }} />

          {/* === Hero（精简版：只占第一屏的一部分，输入框优先可见） === */}
          {/* Logo */}
          <div className="hero-fade-up" style={{
            position: 'relative',
            display: 'inline-block',
            marginBottom: '12px',
            zIndex: 1,
          }}>
            <div className="logo-breath" style={{
              width: '56px',
              height: '56px',
              margin: '0 auto',
              background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              boxShadow: '0 8px 24px rgba(99, 102, 241, 0.3)',
            }}>🔬</div>
          </div>

          {/* Title */}
          <h1 className="hero-fade-delay-1" style={{
            fontSize: '38px',
            fontWeight: 900,
            margin: 0,
            letterSpacing: '-0.02em',
            position: 'relative',
            zIndex: 1,
          }}>
            <span className="shimmer-text">ResearchKit OS</span>
          </h1>

          {/* One-liner slogan */}
          <p className="hero-fade-delay-2" style={{
            fontSize: '17px',
            fontWeight: 600,
            marginTop: '8px',
            color: '#0f172a',
            letterSpacing: '-0.005em',
            position: 'relative',
            zIndex: 1,
          }}>
            Read Less. <span style={{ color: '#6366f1' }}>Learn More.</span> <span style={{ color: '#06b6d4' }}>Build Faster.</span>
          </p>

          {/* Tiny tagline */}
          <p className="hero-fade-delay-3" style={{
            color: '#5a6478',
            fontSize: '13px',
            marginTop: '4px',
            fontWeight: 500,
            position: 'relative',
            zIndex: 1,
          }}>
            {t('home.heroHint')}
          </p>
        </div>

        {/* === Input Card — 紧接 Hero，第一屏即可见 === */}
        <div className="section-fade-in hero-fade-delay-4 input-card" style={{ background: 'white', borderRadius: '20px', padding: '28px', boxShadow: '0 4px 20px rgba(99, 102, 241, 0.08)', marginTop: '24px', marginBottom: '24px' }}>
          {/* D-fix — 用 form 包裹 mode tabs + input + actions，让按钮 type=submit 走原生提交（避免坐标拦截 + Enter 提交） */}
          <form onSubmit={handleSubmit}>
          {/* Mode tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <button key="text" type="button" onClick={() => { setMode('text'); setError('') }} style={tabStyle(mode === 'text')} className={mode === 'text' ? 'mode-tab-active' : ''}>{t('home.modeTabs.text')}</button>
            <button key="url" type="button" onClick={() => { setMode('url'); setError('') }} style={tabStyle(mode === 'url')} className={mode === 'url' ? 'mode-tab-active' : ''}>{t('home.modeTabs.url')}</button>
            <button key="pdf" type="button" onClick={() => { setMode('pdf'); setError('') }} style={tabStyle(mode === 'pdf')} className={mode === 'pdf' ? 'mode-tab-active' : ''}>{t('home.modeTabs.pdf')}</button>
            <button key="batch" type="button" onClick={() => { setMode('batch'); setError('') }} style={tabStyle(mode === 'batch')} className={mode === 'batch' ? 'mode-tab-active' : ''}>{t('home.modeTabs.batch')}</button>
          </div>

          {/* Input field */}
          {mode === 'text' && (
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('home.placeholders.textLong')}
              style={inputStyle}
              // Enter 直接提交（Shift+Enter 换行）— D-fix
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  ;(e.currentTarget.closest('form') as HTMLFormElement | null)?.requestSubmit()
                }
              }}
              onFocus={(e) => (e.target.style.borderColor = '#6366f1')}
              onBlur={(e) => (e.target.style.borderColor = '#e2e8f2')}
            />
          )}

          {mode === 'url' && (
            <input
              type="url"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('home.placeholders.urlLong')}
              style={{ ...inputStyle, minHeight: 'auto' }}
              onFocus={(e) => (e.target.style.borderColor = '#6366f1')}
              onBlur={(e) => (e.target.style.borderColor = '#e2e8f2')}
            />
          )}

          {mode === 'batch' && (
            <>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t('home.placeholders.batchLong')}
                style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '13px' }}
                onFocus={(e) => (e.target.style.borderColor = '#6366f1')}
                onBlur={(e) => (e.target.style.borderColor = '#e2e8f2')}
              />
              <div style={{ marginTop: '8px', fontSize: '13px', color: '#94a3b8' }}>
                {t('home.placeholders.batchHint')}
              </div>
            </>
          )}

          {mode === 'pdf' && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                const file = e.dataTransfer.files[0]
                if (!file) return
                if (!(file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf')) {
                  setError(t('home.pdf.wrongType'))
                  return
                }
                // 客户端预校验大小，避免大文件上传后才报错（服务端 10MB 上限）
                if (file.size > 10 * 1024 * 1024) {
                  setError(t('home.pdf.tooLarge', { size: (file.size / 1024 / 1024).toFixed(1) }))
                  return
                }
                setPdfFile(file)
                setError('')
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
                boxSizing: 'border-box',  // 避免 padding+border 让 width:100% 溢出容器
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (file.size > 10 * 1024 * 1024) {
                    setError(t('home.pdf.tooLarge', { size: (file.size / 1024 / 1024).toFixed(1) }))
                    return
                  }
                  setPdfFile(file)
                  setError('')
                }}
              />
              {pdfFile ? (
                <>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>✓</div>
                  <div style={{ fontWeight: 600, color: '#10b981', marginBottom: '4px' }}>{pdfFile.name}</div>
                  <div style={{ fontSize: '13px', color: '#5a6478' }}>{(pdfFile.size / 1024).toFixed(1)} KB · {t('home.pdf.selected')}</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📄</div>
                  <div style={{ fontWeight: 600, color: '#5a6478', marginBottom: '4px' }}>{t('home.pdf.dropHint')}</div>
                  <div style={{ fontSize: '13px', color: '#94a3b8' }}>{t('home.pdf.dropHint2')}</div>
                </>
              )}
            </div>
          )}

          {/* D39 — Language Detect Banner(只在 text / url / batch 模式显示) */}
          {mode !== 'pdf' && userPrefs && (
            <LanguageDetectBanner
              input={input}
              appLocale={userPrefs.appLocale}
              outputLocale={userPrefs.outputLocale}
              onApplySuggestion={handleApplyLanguageSuggestion}
            />
          )}

          {/* Actions */}
          <div className="action-row" style={{ display: 'flex', gap: '12px', marginTop: '20px', alignItems: 'center' }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1, padding: '14px 24px',
                background: loading ? '#cbd5e1' : 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
                color: 'white', border: 'none', borderRadius: '12px',
                fontSize: '16px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'transform 0.2s', transform: loading ? 'none' : 'scale(1)',
              }}
            >
              {loading ? t('home.buttons.generating') : t('home.buttons.generate')}
            </button>
            <button
              type="button"
              onClick={loadExample}
              style={{
                padding: '14px 20px', background: '#f1f5f9', color: '#5a6478',
                border: 'none', borderRadius: '12px', cursor: 'pointer',
                fontSize: '14px', fontWeight: 600,
              }}
            >{t('home.buttons.loadExample')}</button>
          </div>
          </form>

          {/* 可视化生成进度面板 */}
          {progressStage > 0 && progressStage < 8 && (
            <div className="progress-panel" style={{
              marginTop: '20px',
              padding: '24px',
              background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
              borderRadius: '16px',
              border: '1px solid #e0e7ff',
            }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <div style={{
                  width: '32px', height: '32px',
                  background: 'linear-gradient(135deg, #6366f1, #06b6d4)',
                  borderRadius: '8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '16px',
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
                  animation: 'spin 2s linear infinite',
                }}>⚙️</div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                    {progressStage === 7 ? t('home.progress.done') : t('home.progress.executing')}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    {progressStage < 7
                      ? t('home.progress.stageXofY', { current: progressStage, seconds: Math.floor((Date.now() - progressStartedAt) / 1000) })
                      : t('home.progress.totalTime', { seconds: Math.floor((Date.now() - progressStartedAt) / 1000) })
                    }
                  </div>
                </div>
                {/* 整体进度条 */}
                <div style={{ marginLeft: 'auto', width: '120px', height: '6px', background: '#e0e7ff', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${(progressStage / 6) * 100}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #6366f1, #06b6d4)',
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>

              {/* Stage list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {STAGES.map((stage) => {
                  const stageState = progressStage > stage.id
                    ? 'done'
                    : progressStage === stage.id
                      ? 'active'
                      : 'pending'
                  return (
                    <div key={stage.id} className="stage-item" style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      background: stageState === 'done' ? '#f0fdf4'
                        : stageState === 'active' ? 'white'
                        : 'transparent',
                      border: stageState === 'done' ? '1px solid #bbf7d0'
                        : stageState === 'active' ? '1px solid #c7d2fe'
                        : '1px solid transparent',
                      transition: 'all 0.4s ease',
                      transform: stageState === 'active' ? 'translateX(4px)' : 'translateX(0)',
                      animationDelay: `${stage.id * 0.08}s`,
                    }}>
                      {/* Status icon */}
                      <div style={{
                        width: '28px', height: '28px',
                        borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '13px', fontWeight: 700,
                        flexShrink: 0,
                        background: stageState === 'done' ? '#10b981'
                          : stageState === 'active' ? '#6366f1'
                          : '#e2e8f0',
                        color: 'white',
                        transition: 'all 0.3s ease',
                        boxShadow: stageState === 'active' ? '0 0 0 4px rgba(99, 102, 241, 0.2)' : 'none',
                      }}>
                        {stageState === 'done' ? '✓'
                          : stageState === 'active' ? ''
                          : stage.icon}
                        {stageState === 'active' && (
                          <span style={{
                            display: 'inline-block',
                            width: '12px', height: '12px',
                            border: '2px solid white',
                            borderTopColor: 'transparent',
                            borderRadius: '50%',
                            animation: 'spin 0.8s linear infinite',
                          }} />
                        )}
                      </div>

                      {/* Label + desc */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '13px', fontWeight: 600,
                          color: stageState === 'done' ? '#065f46'
                            : stageState === 'active' ? '#0f172a'
                            : '#94a3b8',
                          transition: 'color 0.3s ease',
                        }}>
                          {stage.label}
                        </div>
                        <div style={{
                          fontSize: '11px', color: '#94a3b8',
                          marginTop: '2px',
                          opacity: stageState === 'pending' ? 0.6 : 1,
                        }}>
                          {stage.desc}
                        </div>
                      </div>

                      {/* Status badge */}
                      {stageState === 'done' && (
                        <span style={{ fontSize: '10px', color: '#10b981', fontWeight: 700 }}>{t('home.progress.badgeDone')}</span>
                      )}
                      {stageState === 'active' && (
                        <span style={{ fontSize: '10px', color: '#6366f1', fontWeight: 700, animation: 'pulse 1.5s ease-in-out infinite' }}>{t('home.progress.badgeRunning')}</span>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Spin keyframe */}
              <style dangerouslySetInnerHTML={{ __html: `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }` }} />
            </div>
          )}

          {error && (
            <div key={error} className="error-shake" style={{ marginTop: '16px', padding: '14px 16px', background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '12px', fontSize: '14px' }}>
              ❌ {error}
            </div>
          )}
        </div>

        {/* === Capability Matrix — 移到输入框之后，不再占第一屏 === */}
        <div className="cap-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '12px',
          marginBottom: '24px',
          marginTop: '8px',
        }}>
          {/* Agents header */}
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
            <span style={{ fontSize: '16px' }}>🧠</span>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {t('home.pipeline.autonomous')}
            </h3>
          </div>

          {[
            { icon: '🧠', name: t('home.agents.planner.name'), role: t('home.agents.planner.role'), color: '#6366f1' },
            { icon: '📖', name: t('home.agents.reader.name'), role: t('home.agents.reader.role'), color: '#06b6d4' },
            { icon: '🔬', name: t('home.agents.analyzer.name'), role: t('home.agents.analyzer.role'), color: '#0891b2' },
            { icon: '🔤', name: t('home.agents.terminology.name'), role: t('home.agents.terminology.role'), color: '#0e7490' },
            { icon: '🏗️', name: t('home.agents.kbBuilder.name'), role: t('home.agents.kbBuilder.role'), color: '#7c3aed' },
            { icon: '📚', name: t('home.agents.recommend.name'), role: t('home.agents.recommend.role'), color: '#8b5cf6' },
            { icon: '📤', name: t('home.agents.export.name'), role: t('home.agents.export.role'), color: '#db2777' },
          ].map((a, i) => (
            <div key={i} className="agent-card" style={{
              background: 'white',
              borderRadius: '12px',
              padding: '14px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              borderLeft: `3px solid ${a.color}`,
            }}>
              <div style={{ fontSize: '18px', marginBottom: '4px' }}>{a.icon}</div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a' }}>{a.name}</div>
              <div style={{ fontSize: '10px', color: '#5a6478', marginTop: '2px' }}>{a.role}</div>
            </div>
          ))}

          {/* Tools header */}
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
            <span style={{ fontSize: '16px' }}>🔧</span>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0891b2', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {t('home.pipeline.mcpTools')}
            </h3>
          </div>

          {[
            { icon: '💾', name: t('home.tools.memory.name'), desc: t('home.tools.memory.desc'), color: '#0891b2' },
            { icon: '📄', name: t('home.tools.filesystem.name'), desc: t('home.tools.filesystem.desc'), color: '#0e7490' },
            { icon: '🔍', name: t('home.tools.arxiv.name'), desc: t('home.tools.arxiv.desc'), color: '#06b6d4' },
            { icon: '🌐', name: t('home.tools.webSearch.name'), desc: t('home.tools.webSearch.desc'), color: '#0891b2' },
          ].map((tool, i) => (
            <div key={i} className="agent-card" style={{
              background: 'white',
              borderRadius: '12px',
              padding: '14px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              borderLeft: `3px solid ${tool.color}`,
            }}>
              <div style={{ fontSize: '18px', marginBottom: '4px' }}>{tool.icon}</div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a' }}>{tool.name}</div>
              <div style={{ fontSize: '10px', color: '#5a6478', marginTop: '2px' }}>{tool.desc}</div>
            </div>
          ))}
        </div>

        {/* D9 Memory v1 — Smart Suggestion Banner（result 顶部） */}
        {result && smartSuggestion && smartSuggestion.bestMatch && !suggestionDismissed && (
          <div className="smart-suggestion-wrapper">
            <SmartSuggestionBanner
            suggestion={smartSuggestion}
            onCompareNow={() => {
              if (!smartSuggestion.bestMatch) return
              setComparePreselectId(smartSuggestion.bestMatch.id)
              setComparePreselectTrigger(prev => prev + 1)
              setExportTab('compare')
              // 滚动到 Compare tab 区
              setTimeout(() => {
                const el = document.getElementById('export-section')
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }, 100)
            }}
            onDismiss={() => setSuggestionDismissed(true)}
            />
          </div>
        )}

        {/* Result */}
        {result && (() => {
          const L = getKcFieldLabels(resolvedLocale)
          return (
          <div id="result-section" className="section-fade-in" key={`result-${result.title}-${result.year || ''}`}>
            <style dangerouslySetInnerHTML={{ __html: `@keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }` }} />

            {/* Simple / Advanced 切换 — 顶部固定 */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', background: 'white', borderRadius: '999px', padding: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
                <button
                  onClick={() => setUiMode('simple')}
                  style={{
                    padding: '8px 20px',
                    border: 'none',
                    borderRadius: '999px',
                    cursor: 'pointer',
                    background: uiMode === 'simple' ? 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)' : 'transparent',
                    color: uiMode === 'simple' ? 'white' : '#5a6478',
                    fontWeight: 700,
                    fontSize: '13px',
                    transition: 'all 0.2s',
                  }}
                >{t('home.uiMode.simpleBtn')}</button>
                <button
                  onClick={() => setUiMode('advanced')}
                  style={{
                    padding: '8px 20px',
                    border: 'none',
                    borderRadius: '999px',
                    cursor: 'pointer',
                    background: uiMode === 'advanced' ? 'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)' : 'transparent',
                    color: uiMode === 'advanced' ? 'white' : '#5a6478',
                    fontWeight: 700,
                    fontSize: '13px',
                    transition: 'all 0.2s',
                  }}
                >{t('home.uiMode.advancedBtn')}</button>
              </div>
            </div>

            {/* Agent Pipeline — 仅 Advanced 模式显示（D6 抽到 AgentTimeline 组件） */}
            {uiMode === 'advanced' && plan && (
              <AgentTimeline
                plan={plan}
                execution={execution}
                iterations={iterations}
                totalIterations={totalIterations}
                reflection={reflection}
                toolCalls={toolCalls}
                agentMeta={agentMeta}
                expanded={pipelineExpanded}
                onToggleExpand={() => setPipelineExpanded(!pipelineExpanded)}
                // D6 — 从 SSE metadata 透传 token/cost 字段
                perAgentUsage={agentMeta?.per_agent_usage || []}
                totalUsage={agentMeta?.total_tokens ? {
                  promptTokens: agentMeta.total_prompt_tokens || 0,
                  completionTokens: agentMeta.total_completion_tokens || 0,
                  totalTokens: agentMeta.total_tokens || 0,
                } : null}
                totalCostUsd={typeof agentMeta?.total_cost_usd === 'number' ? agentMeta.total_cost_usd : null}
              />
            )}

            {/* D20 KC 生成成功庆祝彩带 — 仅在 KC 标题变化时挂载一次 */}
            <div key={`burst-${result.title}`} className="success-burst" aria-hidden />

            {/* Title card with metadata */}
            <div key={`kc-${result.title}`} className="kc-success-enter kc-title" style={{ background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)', borderRadius: '20px', padding: '28px', color: 'white', marginBottom: '16px', boxShadow: '0 8px 24px rgba(99, 102, 241, 0.25)' }}>
              <div style={{ fontSize: '14px', opacity: 0.8, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{L.knowledgeCard}</div>
              <h2 className="title-glow" style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 12px 0' }}>{result.title}</h2>
              {/* Meta chips */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                {result.authors?.length > 0 && (
                  <Chip>✍️ {result.authors.slice(0, 3).join(', ')}{result.authors.length > 3 ? ` ${t('home.fields.andOthers')}` : ''}</Chip>
                )}
                {result.field && <Chip>🏷️ {result.field}</Chip>}
                {result.year && <Chip>📅 {result.year}</Chip>}
                {result.difficulty && <Chip>📊 {result.difficulty}</Chip>}
                {result.reading_time_min && <Chip>⏱️ {result.reading_time_min} min</Chip>}
              </div>
            </div>

            {/* Summary */}
            {result.summary && (
              <Card title={L.summary} color="#0ea5e9" defaultOpen={true} index={1}>
                <p style={{ margin: 0, lineHeight: 1.8, fontSize: '15px', color: '#0f1729' }}>{result.summary}</p>
              </Card>
            )}

            {/* Research goals */}
            {result.research_goals?.length > 0 && (
              <Card title={L.researchGoals} color="#f97316" index={2}>
                <ol style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.8 }}>
                  {result.research_goals.map((g: string, i: number) => (
                    <li key={i} style={{ marginBottom: '6px' }}>{g}</li>
                  ))}
                </ol>
              </Card>
            )}

            {/* Innovation */}
            {(result.innovation?.length > 0 || result.core_arguments?.length > 0) && (
              <Card title={L.innovation} color="#f59e0b" defaultOpen={true} index={3}>
                <ol style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.8 }}>
                  {(result.innovation || result.core_arguments).map((arg: string, i: number) => (
                    <li key={i} style={{ marginBottom: '8px' }}>{arg}</li>
                  ))}
                </ol>
              </Card>
            )}

            {/* Methodology */}
            {result.methodology && (
              <Card title={L.methodology} color="#10b981" index={4}>
                <p style={{ margin: 0, lineHeight: 1.8 }}>{result.methodology}</p>
              </Card>
            )}

            {/* Experiments */}
            {result.experiments?.length > 0 && (
              <Card title={L.experiments} color="#8b5cf6" index={5}>
                <ol style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.8 }}>
                  {result.experiments.map((e: string, i: number) => (
                    <li key={i} style={{ marginBottom: '6px' }}>{e}</li>
                  ))}
                </ol>
              </Card>
            )}

            {/* Results */}
            {result.results?.length > 0 && (
              <Card title={L.results} color="#06b6d4" index={6}>
                <ol style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.8 }}>
                  {result.results.map((r: string, i: number) => (
                    <li key={i} style={{ marginBottom: '6px' }}>{r}</li>
                  ))}
                </ol>
              </Card>
            )}

            {/* Key terms */}
            {result.key_terms?.length > 0 && (
              <Card title={L.keyTerms} color="#06b6d4" index={7}>
                <div style={{ display: 'grid', gap: '12px' }}>
                  {result.key_terms.map((item: any, i: number) => (
                    <div key={i} style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', borderLeft: '3px solid #06b6d4' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 700, color: '#0f1729' }}>{item.term}</span>
                        {item.category && (
                          <span style={{ fontSize: '11px', padding: '2px 8px', background: '#e0e7ff', color: '#4f46e5', borderRadius: '4px', textTransform: 'uppercase' }}>{item.category}</span>
                        )}
                      </div>
                      <div style={{ color: '#5a6478', fontSize: '14px' }}>{item.definition}</div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Applications */}
            {(result.applications?.length > 0 || result.actionable_takeaways?.length > 0) && (
              <Card title={L.applications} color="#6366f1" index={8}>
                <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.8 }}>
                  {(result.applications || result.actionable_takeaways).map((item: string, i: number) => (
                    <li key={i} style={{ marginBottom: '6px' }}>{item}</li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Datasets */}
            {result.datasets?.length > 0 && (
              <Card title={L.datasets} color="#84cc16" index={9}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {result.datasets.map((d: string, i: number) => (
                    <span key={i} style={{ padding: '6px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#4d7c0f', borderRadius: '999px', fontSize: '13px' }}>{d}</span>
                  ))}
                </div>
              </Card>
            )}

            {/* Limitations */}
            {result.limitations?.length > 0 && (
              <Card title={L.limitations} color="#ef4444" index={10}>
                <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.8 }}>
                  {result.limitations.map((l: string, i: number) => (
                    <li key={i} style={{ marginBottom: '6px' }}>{l}</li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Future work */}
            {result.future_work?.length > 0 && (
              <Card title={L.futureWork} color="#a855f7" index={11}>
                <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.8 }}>
                  {result.future_work.map((f: string, i: number) => (
                    <li key={i} style={{ marginBottom: '6px' }}>{f}</li>
                  ))}
                </ul>
              </Card>
            )}

            {/* References / Recommended readings */}
            {result.references?.length > 0 && (
              <Card title={L.references} color="#8b5cf6" index={12}>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#5a6478', lineHeight: 1.8 }}>
                  {result.references.map((ref: string, i: number) => (
                    <li key={i}>{ref}</li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Tags */}
            {result.tags?.length > 0 && (
              <div style={{ background: 'white', borderRadius: '16px', padding: '16px 24px', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {result.tags.map((tag: string, i: number) => (
                    <span key={i} style={{ padding: '4px 10px', background: '#f1f5f9', color: '#5a6478', borderRadius: '6px', fontSize: '12px' }}>#{tag}</span>
                  ))}
                </div>
              </div>
            )}

            {/* D10 Chat with Knowledge Card — 可折叠，默认展开 */}
            {result && (
              <div style={{ marginBottom: '16px' }}>
                <Card title={t('home.cardTitles.askAnything')} color="#06b6d4" defaultOpen={false} index={13}>
                  <div style={{ marginTop: '4px' }}>
                    <ChatWithKC knowledgeCard={result} />
                  </div>
                </Card>
              </div>
            )}

            {/* D11 Explain Agent — 为不同受众重新解释论文 */}
            {result && (
              <div style={{ marginBottom: '16px' }}>
                <Card title={t('home.cardTitles.explainForAudience')} color="#f59e0b" defaultOpen={false} index={14}>
                  <div style={{ marginTop: '4px' }}>
                    <ExplainKC knowledgeCard={result} />
                  </div>
                </Card>
              </div>
            )}

            {/* D12 Plugin System — 一键导出 KC 到第三方工具 */}
            {result && (
              <div style={{ marginBottom: '16px' }}>
                <Card title={t('home.cardTitles.plugins')} color="#8b5cf6" defaultOpen={false} index={15}>
                  <div style={{ marginTop: '4px' }}>
                    <PluginPanel knowledgeCard={result} />
                  </div>
                </Card>
              </div>
            )}

            {/* Export toolbar — 折叠式：默认只显示 3 按钮，点 Preview 才展开 */}
            {(markdown || obsidian || mindmap || result) && (
              <div id="export-section">
              <Card title={t('home.cardTitles.export')} color="#6366f1" defaultOpen={true} index={13}>
                {/* Format toggle — 4 tabs (Markdown / Obsidian / Knowledge Graph / Compare) */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <div className="export-tabs" style={{ display: 'flex', background: '#f1f5f9', borderRadius: '8px', padding: '2px' }}>
                    <button
                      onClick={() => { setExportTab('markdown'); setMarkdownPreviewOpen(false) }}
                      style={{
                        padding: '6px 12px', border: 'none', borderRadius: '6px', cursor: 'pointer',
                        background: exportTab === 'markdown' ? 'white' : 'transparent',
                        color: exportTab === 'markdown' ? '#6366f1' : '#5a6478',
                        fontWeight: 600, fontSize: '13px', boxShadow: exportTab === 'markdown' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      }}
                    >{t('home.exportTabs.markdown')}</button>
                    <button
                      onClick={() => { setExportTab('obsidian'); setMarkdownPreviewOpen(false) }}
                      style={{
                        padding: '6px 12px', border: 'none', borderRadius: '6px', cursor: 'pointer',
                        background: exportTab === 'obsidian' ? 'white' : 'transparent',
                        color: exportTab === 'obsidian' ? '#8b5cf6' : '#5a6478',
                        fontWeight: 600, fontSize: '13px', boxShadow: exportTab === 'obsidian' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      }}
                    >{t('home.exportTabs.obsidian')}</button>
                    <button
                      onClick={() => { setExportTab('mindmap'); setMarkdownPreviewOpen(false) }}
                      style={{
                        padding: '6px 12px', border: 'none', borderRadius: '6px', cursor: 'pointer',
                        background: exportTab === 'mindmap' ? 'white' : 'transparent',
                        color: exportTab === 'mindmap' ? '#0891b2' : '#5a6478',
                        fontWeight: 600, fontSize: '13px', boxShadow: exportTab === 'mindmap' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      }}
                    >{t('home.exportTabs.knowledgeGraph')}</button>
                    <button
                      onClick={() => { setExportTab('compare'); setMarkdownPreviewOpen(false) }}
                      style={{
                        padding: '6px 12px', border: 'none', borderRadius: '6px', cursor: 'pointer',
                        background: exportTab === 'compare' ? 'white' : 'transparent',
                        color: exportTab === 'compare' ? '#dc2626' : '#5a6478',
                        fontWeight: 600, fontSize: '13px', boxShadow: exportTab === 'compare' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      }}
                    >{t('home.exportTabs.compare')}</button>
                  </div>
                </div>

                {/* Compare Tab — D8 */}
                {exportTab === 'compare' && (
                  <CompareTab
                    currentKC={result}
                    currentSource={undefined}
                    preselectId={comparePreselectId}
                    preselectTrigger={comparePreselectTrigger}
                  />
                )}

                {/* Obsidian hint */}
                {exportTab === 'obsidian' && (
                  <div style={{ marginBottom: '12px', padding: '10px 12px', background: '#f5f3ff', border: '1px solid #ddd6fe', color: '#6d28d9', borderRadius: '8px', fontSize: '13px' }}>
                    {t('home.export.hintObsidian')}
                  </div>
                )}

                {/* Knowledge Graph hint */}
                {exportTab === 'mindmap' && (
                  <div style={{ marginBottom: '12px', padding: '10px 12px', background: '#ecfeff', border: '1px solid #a5f3fc', color: '#0e7490', borderRadius: '8px', fontSize: '13px' }}>
                    {t('home.export.hintGraph')}
                  </div>
                )}

                {/* Button group: Preview / Copy / Download — 仅非 Compare Tab 显示 */}
                {exportTab !== 'compare' && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: exportTab === 'mindmap' ? '12px' : '0' }}>
                  {/* Markdown / Obsidian tab：显示「预览」按钮切换源码视图 */}
                  {/* Knowledge Graph tab：KG 本身就是可视化预览，不需要单独的预览按钮 */}
                  {exportTab !== 'mindmap' && (
                    <button
                      onClick={() => setMarkdownPreviewOpen(!markdownPreviewOpen)}
                      style={{
                        ...btnSecondary,
                        background: markdownPreviewOpen ? '#ede9fe' : '#f1f5f9',
                        color: markdownPreviewOpen ? '#5b21b6' : '#5a6478',
                      }}
                    >
                      {markdownPreviewOpen ? t('home.export.hidePreview') : t('home.export.preview')}
                    </button>
                  )}
                  <button
                    onClick={() => copyMarkdown(exportTab === 'markdown' ? 'md' : exportTab === 'obsidian' ? 'obsidian' : 'mindmap')}
                    className={copied === (exportTab === 'markdown' ? 'md' : exportTab === 'obsidian' ? 'obsidian' : 'mindmap') ? 'copy-success' : ''}
                    style={btnSecondary}
                  >
                    {copied === (exportTab === 'markdown' ? 'md' : exportTab === 'obsidian' ? 'obsidian' : 'mindmap') ? t('home.export.copied') : t('home.export.copy')}
                  </button>
                  <button
                    onClick={() => downloadMarkdown(exportTab === 'markdown' ? 'md' : exportTab === 'obsidian' ? 'obsidian' : 'mindmap')}
                    style={btnPrimary}
                  >
                    {t('home.export.download')}
                  </button>
                </div>
                )}

                {/* Markdown / Obsidian — code view, hidden by default */}
                {exportTab !== 'mindmap' && markdownPreviewOpen && (
                  <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: '16px', borderRadius: '8px', fontSize: '12px', overflow: 'auto', maxHeight: '400px', margin: '12px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {exportTab === 'obsidian' ? obsidian : markdown}
                  </pre>
                )}

                {/* Knowledge Graph — 可折叠 + 生成动画（替代静态 Mermaid Mindmap） */}
                {exportTab === 'mindmap' && (
                  <div className="kg-tree">
                    {/* 优先：KnowledgeGraph 自渲染组件 */}
                    {result && (
                      <KnowledgeGraph
                        rootTitle={result.title || 'Untitled'}
                        tree={knowledgeGraphTree}
                        buildDurationMs={1500}
                      />
                    )}

                    {/* Mermaid 源码 — 默认折叠，点按钮才展开 */}
                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed #e2e8f0' }}>
                      <button
                        onClick={() => setShowMermaidSource(!showMermaidSource)}
                        style={{
                          padding: '6px 12px',
                          background: showMermaidSource ? '#0f172a' : '#f1f5f9',
                          color: showMermaidSource ? '#67e8f9' : '#5a6478',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        {showMermaidSource ? t('home.export.hideMermaidSource') : t('home.export.showMermaidSource')}
                      </button>
                      {showMermaidSource && mindmap && (
                        <pre style={{ background: '#0f172a', color: '#67e8f9', padding: '12px', borderRadius: '8px', fontSize: '11px', overflow: 'auto', maxHeight: '240px', margin: '8px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {mindmap}
                        </pre>
                      )}
                      {/* 兼容老错误提示 */}
                      {mindmapError && showMermaidSource && (
                        <div style={{ marginTop: '8px', padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '8px', fontSize: '12px' }}>
                          {t('home.errors.mermaidSourceFailed', { error: mindmapError })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
              </div>
            )}
          </div>
          )
        })()}

        {/* Batch results — 独立于 result，批量模式不 set result，所以必须放外面 */}
        {batchResults.length > 0 && (
          <div className="section-fade-in" style={{ marginTop: '20px' }}>
            <div style={{ background: '#ef4444', borderRadius: '16px', padding: '20px', color: 'white', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>{t('home.batchResults.title')}</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '14px', opacity: 0.9 }}>
                {t('home.batchResults.stats', {
                  total: batchResults.length,
                  success: batchResults.filter(r => r.success).length,
                  failed: batchResults.filter(r => !r.success).length,
                })}
              </p>
            </div>
            {batchResults.map((r, i) => (
              <div key={i} style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderLeft: `4px solid ${r.success ? '#10b981' : '#ef4444'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '4px', wordBreak: 'break-all' }}>{r.url}</div>
                    {r.success ? (
                      <div style={{ fontWeight: 700, color: '#0f1729' }}>{r.knowledge_card?.title}</div>
                    ) : (
                      <div style={{ color: '#dc2626', fontSize: '14px' }}>❌ {r.error}</div>
                    )}
                  </div>
                  {r.success && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(r.markdown)
                        setCopied('md')
                        setTimeout(() => setCopied(null), 2000)
                      }}
                      className={copied === 'md' ? 'copy-success' : ''}
                      style={{ ...btnSecondary, fontSize: '12px', padding: '6px 10px' }}
                    >{copied === 'md' ? '✓' : '📋'}</button>
                  )}
                </div>
                {r.success && (r.knowledge_card?.innovation?.length > 0 || r.knowledge_card?.core_arguments?.length > 0) && (
                  <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px', fontSize: '13px', color: '#5a6478', lineHeight: 1.6 }}>
                    {(r.knowledge_card.innovation || r.knowledge_card.core_arguments).slice(0, 3).map((arg: string, j: number) => (
                      <li key={j}>{arg}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: '40px', padding: '20px', color: '#94a3b8', fontSize: '13px' }}>
          <strong style={{ color: '#5a6478' }}>{t('home.footer.version')}</strong> — AI Research Operating System<br />
          <span style={{ fontSize: '12px' }}>{t('home.footer.description')}</span>
        </div>
      </main>
      {/* D34 — 浮动回到顶部按钮 */}
      <ScrollToTop />

      {/* D28 — Live Thoughts 浮窗：实时展示 Planner / Reflection / Replan 的 token 流 */}
      <LiveThoughts thoughts={liveThoughts} active={liveThoughtsActive} />
    </div>
  )
}

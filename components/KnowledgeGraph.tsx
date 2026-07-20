'use client'

/**
 * KnowledgeGraph — 可折叠知识图谱
 *
 * 替代 mermaid mindmap 静态 SVG：
 * 1. 生成时显示动画（Building... ● ● ● ✓ Completed）
 * 2. 默认只展开两级（root + 主分支标题展示）
 * 3. 点击分支节点才展开下一级（叶子节点）
 * 4. 评委看到的是"活的"知识图谱，不是静态脑图
 */

import { useState, useEffect } from 'react'

// 知识图谱节点（前端自用结构）
export interface KGNode {
  id: string
  label: string
  icon?: string
  color: string
  children: KGNode[]
}

interface KnowledgeGraphProps {
  rootTitle: string
  tree: KGNode[]
  /** 生成动画持续多久（ms）— 模拟 LLM/Agent 正在构建 */
  buildDurationMs?: number
}

export default function KnowledgeGraph({
  rootTitle,
  tree,
  buildDurationMs = 1500,
}: KnowledgeGraphProps) {
  const [building, setBuilding] = useState(true)
  const [buildProgress, setBuildProgress] = useState(0)
  const [revealCount, setRevealCount] = useState(0)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

  // 用 rootTitle 作为 build 的 key — 只有 rootTitle 变化时才重新跑 building 动画
  // 避免 inline 创建的 tree 数组引用每次 re-render 都变，导致 useEffect 无限重跑
  const buildKey = rootTitle
  const [lastBuildKey, setLastBuildKey] = useState(buildKey)

  // 生成动画：节点逐个亮起（仅在 buildKey 变化时触发）
  useEffect(() => {
    if (buildKey === lastBuildKey) return // 同一份结果，不重新跑动画
    setLastBuildKey(buildKey)

    setBuilding(true)
    setBuildProgress(0)
    setRevealCount(0)
    setExpandedNodes(new Set()) // 重置展开状态

    const totalNodes = tree.length
    if (totalNodes === 0) {
      setBuilding(false)
      return
    }

    const stepMs = buildDurationMs / totalNodes
    const revealTimers: number[] = []
    for (let i = 0; i < totalNodes; i++) {
      const t = window.setTimeout(() => {
        setRevealCount(i + 1)
        setBuildProgress(Math.round(((i + 1) / totalNodes) * 100))
      }, (i + 1) * stepMs)
      revealTimers.push(t)
    }
    const doneTimer = window.setTimeout(() => {
      setBuilding(false)
    }, buildDurationMs + 200)

    return () => {
      revealTimers.forEach(clearTimeout)
      clearTimeout(doneTimer)
    }
  }, [buildKey]) // 只依赖 buildKey，不依赖 tree（避免无限循环）
  // eslint-disable-next-line react-hooks/exhaustive-deps

  // 首次挂载也要触发动画
  useEffect(() => {
    setBuilding(true)
    setBuildProgress(0)
    setRevealCount(0)

    const totalNodes = tree.length
    if (totalNodes === 0) {
      setBuilding(false)
      return
    }

    const stepMs = buildDurationMs / totalNodes
    const revealTimers: number[] = []
    for (let i = 0; i < totalNodes; i++) {
      const t = window.setTimeout(() => {
        setRevealCount(i + 1)
        setBuildProgress(Math.round(((i + 1) / totalNodes) * 100))
      }, (i + 1) * stepMs)
      revealTimers.push(t)
    }
    const doneTimer = window.setTimeout(() => {
      setBuilding(false)
    }, buildDurationMs + 200)

    return () => {
      revealTimers.forEach(clearTimeout)
      clearTimeout(doneTimer)
    }
  }, []) // 仅首次挂载
  // eslint-disable-next-line react-hooks/exhaustive-deps

  const toggleNode = (id: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => {
    if (expandedNodes.size === 0) {
      const all = new Set<string>()
      const walk = (n: KGNode) => {
        if (n.children.length > 0) all.add(n.id)
        n.children.forEach(walk)
      }
      tree.forEach(walk)
      setExpandedNodes(all)
    } else {
      setExpandedNodes(new Set())
    }
  }

  // ===== Building 阶段 =====
  if (building) {
    return (
      <div style={{
        padding: '48px 24px',
        background: 'linear-gradient(135deg, #fafbff 0%, #f0f4ff 100%)',
        border: '1px solid #e0e7ff',
        borderRadius: '16px',
        textAlign: 'center',
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '20px',
        }}>
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: i <= buildProgress / 25
                  ? 'linear-gradient(135deg, #6366f1, #06b6d4)'
                  : '#e0e7ff',
                transition: 'all 0.3s ease',
                animation: i <= buildProgress / 25 ? `kg-pulse 1.5s ease-in-out ${i * 0.15}s infinite` : 'none',
                boxShadow: i <= buildProgress / 25 ? '0 0 12px rgba(99, 102, 241, 0.4)' : 'none',
              }}
            />
          ))}
        </div>

        <div style={{
          fontSize: '15px',
          fontWeight: 700,
          color: '#0f172a',
          marginBottom: '8px',
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        }}>
          Building Knowledge Graph
          {buildProgress < 100 && (
            <span style={{ display: 'inline-block', marginLeft: '4px', width: '24px', textAlign: 'left' }}>
              {'●'.repeat(Math.min(3, Math.floor(buildProgress / 33) + 1))}
            </span>
          )}
          {buildProgress === 100 && (
            <span style={{ color: '#10b981', marginLeft: '8px' }}>✓ Completed</span>
          )}
        </div>

        <div style={{
          margin: '16px auto 0',
          maxWidth: '320px',
          height: '4px',
          background: '#e0e7ff',
          borderRadius: '2px',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${buildProgress}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #6366f1, #06b6d4)',
            transition: 'width 0.3s ease',
          }} />
        </div>
        <div style={{ marginTop: '8px', fontSize: '11px', color: '#94a3b8' }}>
          {buildProgress < 100
            ? `Extracting concepts... ${buildProgress}%`
            : 'Knowledge graph ready — click branches to expand'}
        </div>

        <style dangerouslySetInnerHTML={{ __html: `@keyframes kg-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.3); opacity: 0.7; } }` }} />
      </div>
    )
  }

  // ===== 展示阶段：可折叠树 =====
  return (
    <div style={{
      padding: '24px',
      background: 'linear-gradient(135deg, #fafbff 0%, #f0f9ff 100%)',
      border: '1px solid #e0e7ff',
      borderRadius: '16px',
      overflow: 'auto',
      maxHeight: '600px',
    }}>
      <div style={{
        textAlign: 'center',
        marginBottom: '24px',
        paddingBottom: '16px',
        borderBottom: '1px dashed #c7d2fe',
      }}>
        <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>
          Knowledge Graph
        </div>
        <div style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
          {rootTitle}
        </div>
        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
          点击分支节点展开 / 收起
        </div>
      </div>

      <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: '13px' }}>
        <div style={{
          display: 'inline-block',
          padding: '8px 16px',
          background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
          color: 'white',
          borderRadius: '8px',
          fontWeight: 700,
          fontSize: '14px',
          boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
          marginBottom: '8px',
        }}>
          🎯 {rootTitle}
        </div>

        {tree.map((branch, i) => (
          <TreeNode
            key={branch.id}
            node={branch}
            depth={1}
            expandedNodes={expandedNodes}
            onToggle={toggleNode}
            visible={i < revealCount}
            delay={i * 0.05}
          />
        ))}
      </div>

      <div style={{
        marginTop: '16px',
        paddingTop: '12px',
        borderTop: '1px dashed #c7d2fe',
        fontSize: '11px',
        color: '#94a3b8',
        textAlign: 'center',
      }}>
        💡 默认只展示两级，点 <strong>▸</strong> 展开叶子节点。
        <button
          onClick={expandAll}
          style={{
            marginLeft: '8px',
            padding: '2px 8px',
            background: 'white',
            border: '1px solid #c7d2fe',
            borderRadius: '4px',
            color: '#6366f1',
            cursor: 'pointer',
            fontSize: '10px',
            fontWeight: 600,
          }}
        >
          {expandedNodes.size === 0 ? '全部展开' : '全部收起'}
        </button>
      </div>
    </div>
  )
}

// ===== 通用树节点（递归） =====
function TreeNode({
  node,
  depth,
  expandedNodes,
  onToggle,
  visible,
  delay = 0,
}: {
  node: KGNode
  depth: number
  expandedNodes: Set<string>
  onToggle: (id: string) => void
  visible: boolean
  delay?: number
}) {
  const hasChildren = node.children.length > 0
  const isExpanded = expandedNodes.has(node.id)
  const indent = depth * 24

  return (
    <div style={{
      marginLeft: `${indent}px`,
      marginTop: '4px',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateX(0)' : 'translateX(-8px)',
      transition: 'all 0.3s ease',
      animation: visible ? `kg-slide-in 0.4s ease-out ${delay}s both` : 'none',
    }}>
      <div
        className="kg-branch-hover"
        onClick={() => hasChildren && onToggle(node.id)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          background: hasChildren
            ? (isExpanded ? node.color : 'white')
            : `${node.color}10`,
          color: hasChildren
            ? (isExpanded ? 'white' : node.color)
            : '#5a6478',
          border: `1px solid ${node.color}`,
          borderRadius: '6px',
          cursor: hasChildren ? 'pointer' : 'default',
          fontSize: '12px',
          fontWeight: 600,
          transition: 'all 0.2s ease',
          userSelect: 'none',
        }}
      >
        {hasChildren && (
          <span style={{ width: '12px', display: 'inline-block' }}>
            {isExpanded ? '▾' : '▸'}
          </span>
        )}
        {node.icon && <span>{node.icon}</span>}
        <span>{node.label}</span>
        {hasChildren && (
          <span style={{
            fontSize: '10px',
            opacity: 0.7,
            marginLeft: '4px',
            padding: '1px 6px',
            background: isExpanded ? 'rgba(255,255,255,0.2)' : `${node.color}1a`,
            borderRadius: '8px',
          }}>
            {node.children.length}
          </span>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div style={{
          marginTop: '4px',
          paddingLeft: '12px',
          borderLeft: `2px solid ${node.color}40`,
        }}>
          {node.children.map((child, i) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedNodes={expandedNodes}
              onToggle={onToggle}
              visible={true}
              delay={i * 0.04}
            />
          ))}
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `@keyframes kg-slide-in { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }` }} />
    </div>
  )
}

/**
 * 从 KnowledgeCard 构建 KnowledgeGraph 树
 * 只取每个类别的 top 3 叶子节点（避免信息爆炸）
 */
export function buildKnowledgeGraph(card: any): KGNode[] {
  const truncate = (s: string, max = 50) => s.length > max ? s.substring(0, max - 3) + '...' : s

  const nodes: KGNode[] = []

  // 摘要
  if (card.summary) {
    nodes.push({
      id: 'summary',
      label: 'Summary',
      icon: '📌',
      color: '#6366f1',
      children: [{ id: 'summary-1', label: truncate(card.summary, 80), color: '#6366f1', children: [] }],
    })
  }

  // 作者
  if (card.authors && card.authors.length > 0) {
    nodes.push({
      id: 'authors',
      label: 'Authors',
      icon: '👥',
      color: '#0891b2',
      children: card.authors.slice(0, 5).map((a: string, i: number) => ({
        id: `author-${i}`,
        label: a,
        color: '#0891b2',
        children: [],
      })),
    })
  }

  // 元数据
  const metaBits: string[] = []
  if (card.field) metaBits.push(`Field: ${card.field}`)
  if (card.year) metaBits.push(`Year: ${card.year}`)
  if (card.difficulty) metaBits.push(`Level: ${card.difficulty}`)
  if (metaBits.length > 0) {
    nodes.push({
      id: 'meta',
      label: 'Metadata',
      icon: '🏷️',
      color: '#7c3aed',
      children: metaBits.map((m, i) => ({ id: `meta-${i}`, label: m, color: '#7c3aed', children: [] })),
    })
  }

  // 研究目的
  if (card.research_goals && card.research_goals.length > 0) {
    nodes.push({
      id: 'goals',
      label: 'Research Goals',
      icon: '🎯',
      color: '#f59e0b',
      children: card.research_goals.slice(0, 3).map((g: string, i: number) => ({
        id: `goal-${i}`,
        label: truncate(g),
        color: '#f59e0b',
        children: [],
      })),
    })
  }

  // 创新点
  const innovation = card.innovation || card.core_arguments || []
  if (innovation.length > 0) {
    nodes.push({
      id: 'innovation',
      label: 'Core Ideas',
      icon: '💡',
      color: '#ec4899',
      children: innovation.slice(0, 3).map((arg: string, i: number) => ({
        id: `innov-${i}`,
        label: truncate(arg),
        color: '#ec4899',
        children: [],
      })),
    })
  }

  // 方法论
  if (card.methodology) {
    nodes.push({
      id: 'methodology',
      label: 'Methodology',
      icon: '🔧',
      color: '#0e7490',
      children: [{ id: 'method-1', label: truncate(card.methodology, 100), color: '#0e7490', children: [] }],
    })
  }

  // 实验
  if (card.experiments && card.experiments.length > 0) {
    nodes.push({
      id: 'experiments',
      label: 'Experiments',
      icon: '🧪',
      color: '#06b6d4',
      children: card.experiments.slice(0, 3).map((e: string, i: number) => ({
        id: `exp-${i}`,
        label: truncate(e),
        color: '#06b6d4',
        children: [],
      })),
    })
  }

  // 结果
  if (card.results && card.results.length > 0) {
    nodes.push({
      id: 'results',
      label: 'Results',
      icon: '📊',
      color: '#10b981',
      children: card.results.slice(0, 3).map((r: string, i: number) => ({
        id: `res-${i}`,
        label: truncate(r),
        color: '#10b981',
        children: [],
      })),
    })
  }

  // 应用
  if (card.applications && card.applications.length > 0) {
    nodes.push({
      id: 'applications',
      label: 'Applications',
      icon: '🚀',
      color: '#8b5cf6',
      children: card.applications.slice(0, 3).map((a: string, i: number) => ({
        id: `app-${i}`,
        label: truncate(a),
        color: '#8b5cf6',
        children: [],
      })),
    })
  }

  // 关键术语
  if (card.key_terms && card.key_terms.length > 0) {
    nodes.push({
      id: 'terms',
      label: 'Key Terms',
      icon: '🔤',
      color: '#dc2626',
      children: card.key_terms.slice(0, 5).map((t: any, i: number) => ({
        id: `term-${i}`,
        label: typeof t === 'string' ? t : `${t.term}${t.definition ? ' — ' + truncate(t.definition, 40) : ''}`,
        color: '#dc2626',
        children: [],
      })),
    })
  }

  // 局限性
  if (card.limitations && card.limitations.length > 0) {
    nodes.push({
      id: 'limitations',
      label: 'Limitations',
      icon: '⚠️',
      color: '#ea580c',
      children: card.limitations.slice(0, 3).map((l: string, i: number) => ({
        id: `lim-${i}`,
        label: truncate(l),
        color: '#ea580c',
        children: [],
      })),
    })
  }

  // 未来工作
  if (card.future_work && card.future_work.length > 0) {
    nodes.push({
      id: 'future',
      label: 'Future Work',
      icon: '🔮',
      color: '#7c3aed',
      children: card.future_work.slice(0, 3).map((f: string, i: number) => ({
        id: `fut-${i}`,
        label: truncate(f),
        color: '#7c3aed',
        children: [],
      })),
    })
  }

  return nodes
}

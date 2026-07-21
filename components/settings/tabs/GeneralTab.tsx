'use client'

/**
 * GeneralTab — 通用设置（占位）
 *
 * D3 阶段仅占位，D5 接入：
 * - Prompt Preset（角色切换：Academic / Beginner / Developer / Researcher / Product Manager）
 * - Output Language（zh-CN / en-US / ja-JP 等）
 */

export function GeneralTab() {
  return (
    <div
      style={{
        background: 'white',
        borderRadius: '16px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
        padding: '28px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚙️</div>
      <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f1729' }}>
        General Settings
      </h3>
      <p style={{ margin: '12px 0 0', color: '#64748b', fontSize: '14px', maxWidth: '480px', marginLeft: 'auto', marginRight: 'auto' }}>
        Prompt Preset（角色切换）和 Output Language 将在 v2.1 D5 上线。
        届时你可以选择以"Academic / Beginner / Developer / Researcher / Product Manager"角色生成知识卡，
        并指定输出语言（中文 / 英文 / 日文等）。
      </p>
      <div
        style={{
          display: 'inline-block',
          marginTop: '20px',
          padding: '6px 12px',
          background: '#f1f5f9',
          borderRadius: '6px',
          fontSize: '12px',
          color: '#64748b',
          fontWeight: 600,
        }}
      >
        Coming in D5 (7/25)
      </div>
    </div>
  )
}

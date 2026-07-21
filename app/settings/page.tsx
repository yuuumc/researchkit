'use client'

import SettingsContainer from '@/components/settings/SettingsContainer'

export default function SettingsPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '32px 16px' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>
        <header style={{ marginBottom: '24px' }}>
          <a
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: '#6366f1',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: 600,
              marginBottom: '16px',
            }}
          >
            ← Back to ResearchKit
          </a>
          <h1 style={{
            margin: 0,
            fontSize: '28px',
            fontWeight: 800,
            background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Settings
          </h1>
          <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: '14px' }}>
            Configure your LLM provider and customize ResearchKit behavior
          </p>
        </header>
        <SettingsContainer />
      </div>
    </div>
  )
}

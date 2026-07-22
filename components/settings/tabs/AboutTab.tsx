'use client'

import { useI18n } from '@/components/I18nProvider'

/**
 * AboutTab — 关于页(D37 i18n 化)
 *
 * 显示版本信息 + 技术栈
 * Agent 描述复用 settings.prompt.agentXXX 保持单一来源
 */

export function AboutTab() {
  const { t } = useI18n()

  const agents: Array<{ name: string; descKey: string }> = [
    { name: 'Planner', descKey: 'settings.prompt.agentPlanner' },
    { name: 'Reader', descKey: 'settings.prompt.agentReader' },
    { name: 'Analyzer', descKey: 'settings.prompt.agentAnalyzer' },
    { name: 'Terminology', descKey: 'settings.prompt.agentTerminology' },
    { name: 'Recommendation', descKey: 'settings.prompt.agentRecommendation' },
    { name: 'KnowledgeBuilder', descKey: 'settings.prompt.agentKnowledgeBuilder' },
    { name: 'Reflection', descKey: 'settings.prompt.agentReflection' },
    { name: 'Export', descKey: '' },
  ]

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
          {t('settings.about.tagline')}
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
          {t('settings.about.versionBadge', { version: 'v2.3.1' })}
        </div>
      </div>

      <Section title={t('settings.about.missionTitle')}>
        {t('settings.about.missionDesc')}
      </Section>

      <Section title={t('settings.about.agentPipelineTitle')}>
        <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.8 }}>
          {agents.map(a => (
            <li key={a.name}>
              <strong>{a.name}</strong> — {a.descKey ? t(a.descKey) : 'Markdown / Obsidian / Mermaid / JSON'}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t('settings.about.techStackTitle')}>
        <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.8 }}>
          <li><strong>{t('settings.about.techFramework')}</strong> — {t('settings.about.techFrameworkDesc')}</li>
          <li><strong>{t('settings.about.techLLM')}</strong> — {t('settings.about.techLLMDesc')}</li>
          <li><strong>{t('settings.about.techUI')}</strong> — {t('settings.about.techUIDesc')}</li>
          <li><strong>{t('settings.about.techLanguage')}</strong> — {t('settings.about.techLanguageDesc')}</li>
          <li><strong>{t('settings.about.techStorage')}</strong> — {t('settings.about.techStorageDesc')}</li>
        </ul>
      </Section>
    </div>
  )
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

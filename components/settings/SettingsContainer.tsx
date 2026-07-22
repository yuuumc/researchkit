'use client'

import { useState } from 'react'
import { tabStyle } from '@/lib/ui-styles'
import { useI18n } from '@/components/I18nProvider'
import { ProviderTab } from './tabs/ProviderTab'
import { PromptTab } from './tabs/PromptTab'
import { GeneralTab } from './tabs/GeneralTab'
import { CostTab } from './tabs/CostTab'
import { AboutTab } from './tabs/AboutTab'

type TabId = 'provider' | 'prompt' | 'general' | 'cost' | 'about'

/**
 * SettingsContainer — Tab 容器(D37 i18n 化)
 *
 * 5 个 Tab 的 label 走 i18n('settings.tabs.{id}')
 */
export default function SettingsContainer() {
  const { t } = useI18n()
  const [active, setActive] = useState<TabId>('provider')

  const TABS: Array<{ id: TabId; labelKey: string; icon: string }> = [
    { id: 'provider', labelKey: 'settings.tabs.provider', icon: '🔌' },
    { id: 'prompt', labelKey: 'settings.tabs.prompt', icon: '✏️' },
    { id: 'general', labelKey: 'settings.tabs.general', icon: '⚙️' },
    { id: 'cost', labelKey: 'settings.tabs.cost', icon: '💰' },
    { id: 'about', labelKey: 'settings.tabs.about', icon: 'ℹ️' },
  ]

  return (
    <div>
      {/* Tab 切换栏 */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          padding: '6px',
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
          marginBottom: '20px',
          flexWrap: 'wrap',
        }}
      >
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            style={tabStyle(active === tab.id)}
          >
            <span style={{ marginRight: '8px' }}>{tab.icon}</span>
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      <div>
        {active === 'provider' && <ProviderTab />}
        {active === 'prompt' && <PromptTab />}
        {active === 'general' && <GeneralTab />}
        {active === 'cost' && <CostTab />}
        {active === 'about' && <AboutTab />}
      </div>
    </div>
  )
}

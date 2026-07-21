'use client'

import { useState } from 'react'
import { tabStyle } from '@/lib/ui-styles'
import { ProviderTab } from './tabs/ProviderTab'
import { PromptTab } from './tabs/PromptTab'
import { GeneralTab } from './tabs/GeneralTab'
import { AboutTab } from './tabs/AboutTab'

type TabId = 'provider' | 'prompt' | 'general' | 'about'

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'provider', label: 'Provider', icon: '🔌' },
  { id: 'prompt', label: 'Prompt', icon: '✏️' },
  { id: 'general', label: 'General', icon: '⚙️' },
  { id: 'about', label: 'About', icon: 'ℹ️' },
]

/**
 * SettingsContainer — Tab 容器
 *
 * D3 v2.1 实现 3 个 Tab：
 * - Provider — LLM 配置（核心，D3 主要任务）
 * - General — 通用设置（D5 加 Prompt Preset + Output Language）
 * - About — 关于（版本信息）
 *
 * D4 v2.1 新增：
 * - Prompt — Agent Prompt 扩展配置（三层架构的 Project Extension）
 *
 * v2.2 计划新增：
 * - Cost — Cost Dashboard（D6）
 * - Plugins — 插件管理（D12）
 * - Advanced — 高级（D14 Prompt Playground）
 */
export default function SettingsContainer() {
  const [active, setActive] = useState<TabId>('provider')

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
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      <div>
        {active === 'provider' && <ProviderTab />}
        {active === 'prompt' && <PromptTab />}
        {active === 'general' && <GeneralTab />}
        {active === 'about' && <AboutTab />}
      </div>
    </div>
  )
}

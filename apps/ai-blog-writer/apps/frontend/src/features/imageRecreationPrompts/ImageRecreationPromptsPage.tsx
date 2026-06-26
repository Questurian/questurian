import { useState } from 'react'
import SingleImageTab from './tabs/SingleImageTab'
import InsertImagesTab from './tabs/InsertImagesTab'

type TabId = 'single' | 'insert'

const TABS: { id: TabId; label: string }[] = [
  { id: 'single', label: 'Single image' },
  { id: 'insert', label: 'Insert images' },
]

export default function ImageRecreationPromptsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('single')

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ marginBottom: 16 }}>Image Recreation Prompts</h1>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #ddd' }}>
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderBottom: isActive ? '2px solid #333' : '2px solid transparent',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? '#111' : '#666',
                marginBottom: -1,
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'single' ? <SingleImageTab /> : <InsertImagesTab />}
    </div>
  )
}

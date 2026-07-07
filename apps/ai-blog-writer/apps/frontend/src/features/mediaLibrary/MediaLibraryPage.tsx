import { useState } from 'react'
import { useAuth } from '../auth'
import { BrowseTab } from './components/BrowseTab'
import { AuditTab } from './components/AuditTab'
import { OrphansTab } from './components/OrphansTab'
import { UploadTab } from './components/UploadTab'
import { CompositeTab } from './components/CompositeTab'
import './styles.css'

type Tab = 'browse' | 'audit' | 'orphans' | 'upload' | 'composite'

const TABS: { id: Tab; label: string }[] = [
  { id: 'browse', label: 'Browse' },
  { id: 'audit', label: 'Audit' },
  { id: 'orphans', label: 'Orphans' },
  { id: 'upload', label: 'Upload' },
  { id: 'composite', label: 'Composite' },
]

export function MediaLibraryPage() {
  const [activeTab, setActiveTab] = useState<Tab>('browse')
  const { token } = useAuth()

  if (!token) return <div className="ml-error-full">Not authenticated</div>

  return (
    <div className="ml-page">
      <div className="ml-page-header">
        <h2 className="ml-page-title">Media Library</h2>
        <p className="ml-page-subtitle">Manage Payload MediaSets and MediaAssets</p>
      </div>

      <div className="ml-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`ml-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="ml-tab-content">
        {activeTab === 'browse' && <BrowseTab token={token} />}
        {activeTab === 'audit' && <AuditTab token={token} />}
        {activeTab === 'orphans' && <OrphansTab token={token} />}
        {activeTab === 'upload' && <UploadTab token={token} />}
        {activeTab === 'composite' && <CompositeTab token={token} />}
      </div>
    </div>
  )
}

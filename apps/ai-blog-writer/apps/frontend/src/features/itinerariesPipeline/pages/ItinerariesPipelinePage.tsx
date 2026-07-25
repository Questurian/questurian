import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth'
import { ItineraryTitlePipelinePanel } from '../components/ItineraryTitlePipelinePanel'
import { useItineraryTitlePipeline } from '../hooks/useItineraryTitlePipeline'
import '../itineraries-pipeline.css'
import '../../listicleItineraries/styles.css'
import '../../prompt2blog/styles.css'

type ItinerariesPipelineTabId = 'pipeline' | 'main'

export default function ItinerariesPipelinePage() {
  const { token } = useAuth()
  const [activeTab, setActiveTab] = useState<ItinerariesPipelineTabId>('main')
  const pipeline = useItineraryTitlePipeline(token)

  return (
    <div className="stl-page ip-pipeline">
      <header className="stl-hero">
        <div>
          <p className="stl-eyebrow">Questurian Studio</p>
          <h1>Itineraries Pipeline</h1>
          <p className="stl-lede">
            Configure itinerary pipeline runs. More steps will land here as this
            feature grows.
          </p>
        </div>
        <div className="stl-hero-actions">
          <Link className="stl-btn stl-btn-secondary" to="/">
            Back Home
          </Link>
        </div>
      </header>

      <nav className="ip-tabs" aria-label="Itineraries pipeline sections">
        <div className="ip-tab-list" role="tablist">
          <button
            type="button"
            role="tab"
            id="ip-tab-main"
            aria-selected={activeTab === 'main'}
            aria-controls="ip-tab-panel-main"
            className={`ip-tab${activeTab === 'main' ? ' ip-tab--active' : ''}`}
            onClick={() => setActiveTab('main')}
          >
            main
          </button>
          <button
            type="button"
            role="tab"
            id="ip-tab-pipeline"
            aria-selected={activeTab === 'pipeline'}
            aria-controls="ip-tab-panel-pipeline"
            className={`ip-tab${activeTab === 'pipeline' ? ' ip-tab--active' : ''}`}
            onClick={() => setActiveTab('pipeline')}
          >
            Title generator
          </button>
        </div>
      </nav>

      {activeTab === 'pipeline' ? (
        <div
          className="ip-tab-panel"
          role="tabpanel"
          id="ip-tab-panel-pipeline"
          aria-labelledby="ip-tab-pipeline"
        >
          <ItineraryTitlePipelinePanel pipeline={pipeline} />
        </div>
      ) : (
        <div
          className="ip-tab-panel ip-tab-panel--empty"
          role="tabpanel"
          id="ip-tab-panel-main"
          aria-labelledby="ip-tab-main"
        />
      )}
    </div>
  )
}

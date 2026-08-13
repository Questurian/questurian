import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth'
import { fetchItineraries } from '../api'
import { clearDrafts, listDrafts, removeDraft } from '../storage'
import type { PayloadItineraryDoc } from '../types'
import '../styles.css'

function formatDate(value?: string): string {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ListicleItinerariesPage() {
  const [itineraries, setItineraries] = useState<PayloadItineraryDoc[]>([])
  const [localDrafts, setLocalDrafts] = useState(() => listDrafts())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const refreshLocalDrafts = () => {
      setLocalDrafts(listDrafts())
    }

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith('listicle_itineraries_staged_')) {
        refreshLocalDrafts()
      }
    }

    refreshLocalDrafts()
    window.addEventListener('storage', handleStorage)
    window.addEventListener('focus', refreshLocalDrafts)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('focus', refreshLocalDrafts)
    }
  }, [])

  useEffect(() => {

    let cancelled = false
    setIsLoading(true)
    setError(null)

    fetchItineraries()
      .then((response) => {
        if (cancelled) return
        setItineraries(response.docs || [])
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load itineraries')
      })
      .finally(() => {
        if (cancelled) return
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const rows = useMemo(() => {
    const localChangesByPayloadId = new Map(
      localDrafts
        .filter((draft) => draft.payloadId && draft.hasUnsyncedPayloadChanges)
        .map((draft) => [draft.payloadId, draft.draftId]),
    )

    return itineraries.map((doc) => ({
      id: doc.id,
      title: doc.title || 'Untitled',
      location: doc.location || '-',
      status: doc.status || 'draft',
      updatedAt: formatDate(doc.updatedAt),
      localDraftId: localChangesByPayloadId.get(doc.id),
    }))
  }, [itineraries, localDrafts])

  const localRows = useMemo(() => {
    const payloadIds = new Set(itineraries.map((doc) => doc.id))

    return [...localDrafts]
      .filter((draft) => !draft.payloadId || !payloadIds.has(draft.payloadId))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map((draft) => ({
        draftId: draft.draftId,
        title: draft.title || 'Untitled',
        location: draft.location || '-',
        source: draft.payloadId ? `Payload #${draft.payloadId}` : 'Local only',
        updatedAt: formatDate(draft.updatedAt),
      }))
  }, [itineraries, localDrafts])

  const discardLocalDraft = (draftId: string) => {
    const confirmed = window.confirm('Discard this local draft? This cannot be undone.')
    if (!confirmed) return
    removeDraft(draftId)
    setLocalDrafts(listDrafts())
  }

  const clearAllLocalDrafts = () => {
    if (localRows.length === 0) return
    const confirmed = window.confirm(
      `Discard all ${localRows.length} local draft${localRows.length === 1 ? '' : 's'}? This cannot be undone.`,
    )
    if (!confirmed) return
    clearDrafts()
    setLocalDrafts(listDrafts())
  }

  const pageContent = isLoading ? (
    <section className="stl-panel">
      <p className="stl-placeholder">Loading itineraries...</p>
    </section>
  ) : error ? (
    <section className="stl-panel">
      <p className="stl-error">{error}</p>
    </section>
  ) : (
    <>
      <section className="stl-panel">
        <div className="stl-panel-header">
          <h2>Local Drafts ({localRows.length})</h2>
          {localRows.length > 0 ? (
            <button
              type="button"
              className="stl-btn stl-btn-danger stl-btn-xs"
              onClick={clearAllLocalDrafts}
            >
              Clear All
            </button>
          ) : null}
        </div>

        {localRows.length === 0 ? (
          <div className="stl-empty">
            <p>No local drafts saved.</p>
            <p>Save a local draft in the builder to continue work later.</p>
          </div>
        ) : (
          <div className="stl-table-wrap">
            <table className="stl-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Location</th>
                  <th>Source</th>
                  <th>Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {localRows.map((row) => (
                  <tr key={row.draftId}>
                    <td>{row.title}</td>
                    <td>{row.location}</td>
                    <td>{row.source}</td>
                    <td>{row.updatedAt}</td>
                    <td>
                      <div className="stl-table-actions">
                        <Link
                          className="stl-link"
                          to={`/listicle-itineraries/builder?draftId=${encodeURIComponent(row.draftId)}`}
                        >
                          Resume
                        </Link>
                        <button
                          type="button"
                          className="stl-btn stl-btn-danger stl-btn-xs"
                          onClick={() => discardLocalDraft(row.draftId)}
                        >
                          Discard
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="stl-panel">
        <div className="stl-panel-header">
          <h2>Payload Documents ({rows.length})</h2>
        </div>

        {rows.length === 0 ? (
          <div className="stl-empty">
            <p>No listicle-itineraries found.</p>
            <p>Create one to start building this format in the app.</p>
          </div>
        ) : (
          <div className="stl-table-wrap">
            <table className="stl-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.title}</td>
                    <td>{row.location}</td>
                    <td>
                      <span className={`stl-status stl-status-${row.status}`}>{row.status}</span>
                      {row.localDraftId ? (
                        <span className="stl-status stl-status-draft">Local edits</span>
                      ) : null}
                    </td>
                    <td>{row.updatedAt}</td>
                    <td>
                      <Link
                        className="stl-link"
                        to={
                          row.localDraftId
                            ? `/listicle-itineraries/builder?draftId=${encodeURIComponent(row.localDraftId)}`
                            : `/listicle-itineraries/builder?id=${row.id}`
                        }
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )

  return (
    <div className="stl-page">
      <header className="stl-hero">
        <div>
          <p className="stl-eyebrow">Questurian Studio</p>
          <h1>Listicle Itineraries</h1>
          <p className="stl-lede">
            Build and maintain Payload listicle-itinerary articles with AI-assisted block editing.
          </p>
        </div>
        <div className="stl-hero-actions">
          <Link className="stl-btn stl-btn-secondary" to="/">
            Back Home
          </Link>
          <Link className="stl-btn" to="/listicle-itineraries/builder">
            New Itinerary
          </Link>
        </div>
      </header>

      {pageContent}
    </div>
  )
}

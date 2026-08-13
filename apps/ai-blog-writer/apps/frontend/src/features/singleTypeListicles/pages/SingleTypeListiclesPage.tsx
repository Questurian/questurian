import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchListicles } from '../api'
import { clearDrafts, listDrafts, removeDraft } from '../storage'
import type { PayloadListicleDoc } from '../types'
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

function isGenericPayloadError(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return normalized === 'something went wrong.' || normalized === 'something went wrong'
}

export default function SingleTypeListiclesPage() {
  const [listicles, setListicles] = useState<PayloadListicleDoc[]>([])
  const [localDrafts, setLocalDrafts] = useState(() => listDrafts())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const refreshLocalDrafts = () => {
      setLocalDrafts(listDrafts())
    }

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith('single_type_listicles_staged_')) {
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

    fetchListicles()
      .then((response) => {
        if (cancelled) return
        setListicles(response.docs || [])
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load listicles')
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
    return listicles.map((doc) => ({
      id: doc.id,
      title: doc.title || 'Untitled',
      location: doc.location || '-',
      type: doc.listicleType || '-',
      target: doc.targetItemCount ?? '-',
      status: doc.status || 'draft',
      updatedAt: formatDate(doc.updatedAt),
    }))
  }, [listicles])

  const hasBlockingError = Boolean(
    error
    && !(
      rows.length === 0
      && isGenericPayloadError(error)
    ),
  )

  const localRows = useMemo(() => {
    return [...localDrafts]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map((draft) => ({
        draftId: draft.draftId,
        payloadId: draft.payloadId,
        title: draft.title || 'Untitled',
        location: draft.location || '-',
        type: draft.listicleType || '-',
        target: draft.targetItemCount > 0 ? draft.targetItemCount : '-',
        status: draft.status || 'draft',
        updatedAt: formatDate(draft.updatedAt),
      }))
  }, [localDrafts])

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
      <p className="stl-placeholder">Loading listicles...</p>
    </section>
  ) : hasBlockingError ? (
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
                  <th>Type</th>
                  <th>Target</th>
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
                    <td>{row.type}</td>
                    <td>{row.target}</td>
                    <td>{row.payloadId ? `Payload #${row.payloadId}` : 'Local only'}</td>
                    <td>{row.updatedAt}</td>
                    <td>
                      <div className="stl-table-actions">
                        <Link
                          className="stl-link"
                          to={`/single-type-listicles/builder?draftId=${encodeURIComponent(row.draftId)}`}
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
            <p>No single-type-listicles found.</p>
            <p>Create one to start building this format in the app.</p>
          </div>
        ) : (
          <div className="stl-table-wrap">
            <table className="stl-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Location</th>
                  <th>Type</th>
                  <th>Target</th>
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
                    <td>{row.type}</td>
                    <td>{row.target}</td>
                    <td>
                      <span className={`stl-status stl-status-${row.status}`}>{row.status}</span>
                    </td>
                    <td>{row.updatedAt}</td>
                    <td>
                      <Link
                        className="stl-link"
                        to={`/single-type-listicles/builder?id=${row.id}`}
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
    <div className="stl-page stl-single-type-page">
      <header className="stl-hero">
        <div>
          <p className="stl-eyebrow">Questurian Studio</p>
          <h1>Single Type Listicles</h1>
          <p className="stl-lede">
            Build and maintain Payload single-type-listicle articles with AI-assisted block editing.
          </p>
        </div>
        <div className="stl-hero-actions">
          <Link className="stl-btn stl-btn-secondary" to="/">
            Back Home
          </Link>
          <Link className="stl-btn" to="/single-type-listicles/builder">
            New Listicle
          </Link>
        </div>
      </header>
      {pageContent}
    </div>
  )
}

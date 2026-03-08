import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../providers/useAuth'
import { fetchLocationsIndex } from '../api'
import { listDrafts, removeDraft } from '../storage'
import type { LocationDocumentDraft, LocationIndexRow } from '../types'
import { summarizeLocationIndexRow } from '../utils'
import '../styles.css'

type LocationIndexFilters = {
  level: string
  countryName: string
  cityName: string
  neighborhoodName: string
  locationKey: string
}

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

function summarizeDraft(draft: LocationDocumentDraft): string {
  const parts = [draft.countryName, draft.cityName, draft.neighborhoodName].filter((value) => value.trim().length > 0)
  if (parts.length > 0) {
    return parts.join(' / ')
  }

  return draft.country || 'Untitled draft'
}

export default function LocationDocumentsPage() {
  const { token } = useAuth()
  const [payloadRows, setPayloadRows] = useState<LocationIndexRow[]>([])
  const [localDrafts, setLocalDrafts] = useState<LocationDocumentDraft[]>(() => listDrafts())
  const [filters, setFilters] = useState<LocationIndexFilters>({
    level: '',
    countryName: '',
    cityName: '',
    neighborhoodName: '',
    locationKey: '',
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const deferredFilters = useDeferredValue(filters)

  useEffect(() => {
    const refreshDrafts = () => setLocalDrafts(listDrafts())

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith('location_documents_staged_')) {
        refreshDrafts()
      }
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener('focus', refreshDrafts)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('focus', refreshDrafts)
    }
  }, [])

  useEffect(() => {
    if (!token) return

    let cancelled = false
    setIsLoading(true)
    setError(null)

    fetchLocationsIndex(token)
      .then((rows) => {
        if (cancelled) return
        setPayloadRows(rows)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load locations')
      })
      .finally(() => {
        if (cancelled) return
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [token])

  const sortedDrafts = useMemo(() => {
    return [...localDrafts].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }, [localDrafts])

  const filteredPayloadRows = useMemo(() => {
    const normalized = {
      level: deferredFilters.level.trim().toLowerCase(),
      countryName: deferredFilters.countryName.trim().toLowerCase(),
      cityName: deferredFilters.cityName.trim().toLowerCase(),
      neighborhoodName: deferredFilters.neighborhoodName.trim().toLowerCase(),
      locationKey: deferredFilters.locationKey.trim().toLowerCase(),
    }

    return payloadRows.filter((row) => {
      if (normalized.level && row.level !== normalized.level) return false
      if (normalized.countryName && !(row.countryName || '').toLowerCase().includes(normalized.countryName)) return false
      if (normalized.cityName && !(row.cityName || '').toLowerCase().includes(normalized.cityName)) return false
      if (normalized.neighborhoodName && !(row.neighborhoodName || '').toLowerCase().includes(normalized.neighborhoodName)) return false
      if (normalized.locationKey && !row.locationKey.toLowerCase().includes(normalized.locationKey)) return false
      return true
    })
  }, [deferredFilters, payloadRows])

  const discardDraft = (draftId: string) => {
    const confirmed = window.confirm('Discard this local draft? This cannot be undone.')
    if (!confirmed) return
    removeDraft(draftId)
    setLocalDrafts(listDrafts())
  }

  return (
    <div className="ldb-page">
      <header className="ldb-hero">
        <div>
          <p className="ldb-eyebrow">Questurian Studio</p>
          <h1>Location Documents</h1>
          <p className="ldb-lede">
            Create and update Payload `locations` documents with the full guide schema, local drafts, and AI-assisted generation.
          </p>
        </div>
        <div className="ldb-hero-actions">
          <Link className="ldb-btn ldb-btn-secondary" to="/">
            Back Home
          </Link>
          <Link className="ldb-btn" to="/location-documents/builder">
            New Location
          </Link>
        </div>
      </header>

      <section className="ldb-panel">
        <div className="ldb-panel-header">
          <div>
            <h2>Payload Search</h2>
            <p>Filter the live `locations` collection before opening a document in the builder.</p>
          </div>
        </div>
        <div className="ldb-filter-grid">
          <label className="ldb-field">
            <span className="ldb-label">Level</span>
            <select
              className="ldb-select"
              value={filters.level || ''}
              onChange={(event) => setFilters((current) => ({ ...current, level: event.target.value }))}
            >
              <option value="">All levels</option>
              <option value="country">Country</option>
              <option value="city">City</option>
              <option value="neighborhood">Neighborhood</option>
            </select>
          </label>
          <label className="ldb-field">
            <span className="ldb-label">Country Name</span>
            <input
              className="ldb-input"
              type="search"
              value={filters.countryName || ''}
              onChange={(event) => setFilters((current) => ({ ...current, countryName: event.target.value }))}
            />
          </label>
          <label className="ldb-field">
            <span className="ldb-label">City Name</span>
            <input
              className="ldb-input"
              type="search"
              value={filters.cityName || ''}
              onChange={(event) => setFilters((current) => ({ ...current, cityName: event.target.value }))}
            />
          </label>
          <label className="ldb-field">
            <span className="ldb-label">Neighborhood Name</span>
            <input
              className="ldb-input"
              type="search"
              value={filters.neighborhoodName || ''}
              onChange={(event) => setFilters((current) => ({ ...current, neighborhoodName: event.target.value }))}
            />
          </label>
          <label className="ldb-field">
            <span className="ldb-label">Location Key</span>
            <input
              className="ldb-input"
              type="search"
              value={filters.locationKey || ''}
              onChange={(event) => setFilters((current) => ({ ...current, locationKey: event.target.value }))}
            />
          </label>
        </div>
      </section>

      <section className="ldb-panel">
        <div className="ldb-panel-header">
          <div>
            <h2>Local Drafts ({sortedDrafts.length})</h2>
            <p>Autosaved drafts live in this browser until you create or update the Payload document.</p>
          </div>
        </div>

        {sortedDrafts.length === 0 ? (
          <div className="ldb-empty">
            <p>No local drafts saved yet.</p>
            <p>Start a new location document in the builder and it will autosave here.</p>
          </div>
        ) : (
          <div className="ldb-table-wrap">
            <table className="ldb-table">
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Level</th>
                  <th>Source</th>
                  <th>Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedDrafts.map((draft) => (
                  <tr key={draft.draftId}>
                    <td>{summarizeDraft(draft)}</td>
                    <td>
                      <span className={`ldb-status-chip is-${draft.level}`}>{draft.level}</span>
                    </td>
                    <td>{draft.payloadId ? `Payload #${draft.payloadId}` : 'Local only'}</td>
                    <td>{formatDate(draft.updatedAt)}</td>
                    <td>
                      <div className="ldb-table-actions">
                        <Link className="ldb-link" to={`/location-documents/builder?draftId=${encodeURIComponent(draft.draftId)}`}>
                          Resume
                        </Link>
                        <button type="button" className="ldb-danger-link" onClick={() => discardDraft(draft.draftId)}>
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

      <section className="ldb-panel">
        <div className="ldb-panel-header">
          <div>
            <h2>Payload Documents ({filteredPayloadRows.length})</h2>
            <p>Open an existing location document to update the live Payload record.</p>
          </div>
        </div>

        {isLoading ? <p className="ldb-placeholder">Loading locations...</p> : null}
        {error ? <p className="ldb-error">{error}</p> : null}

        {!isLoading && !error ? (
          filteredPayloadRows.length === 0 ? (
            <div className="ldb-empty">
              <p>No location documents matched the current filters.</p>
              <p>Change the search or create a new location from the builder.</p>
            </div>
          ) : (
            <div className="ldb-table-wrap">
              <table className="ldb-table">
                <thead>
                  <tr>
                    <th>Location</th>
                    <th>Key</th>
                    <th>Level</th>
                    <th>Updated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayloadRows.map((row) => (
                    <tr key={row.id}>
                      <td>{summarizeLocationIndexRow(row)}</td>
                      <td>{row.locationKey}</td>
                      <td>
                        <span className={`ldb-status-chip is-${row.level}`}>{row.level}</span>
                      </td>
                      <td>{formatDate(row.updatedAt)}</td>
                      <td>
                        <Link className="ldb-link" to={`/location-documents/builder?id=${row.id}`}>
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </section>
    </div>
  )
}

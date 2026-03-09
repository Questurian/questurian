import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../providers/useAuth'
import { fetchLocationsIndex } from '../api'
import { listDrafts, removeDraft } from '../storage'
import type { LocationDocumentDraft, LocationIndexRow } from '../types'
import { groupLocationIndexRowsByCountry, summarizeLocationIndexRow } from '../utils'
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

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
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

  const payloadCountryGroups = useMemo(
    () => groupLocationIndexRowsByCountry(filteredPayloadRows),
    [filteredPayloadRows],
  )

  const payloadCountryStats = useMemo(() => {
    return payloadCountryGroups.reduce(
      (totals, group) => {
        if (group.countryRow) totals.countryDocs += 1
        totals.cityDocs += group.cityCount
        totals.neighborhoodDocs += group.neighborhoodCount
        return totals
      },
      {
        countryDocs: 0,
        cityDocs: 0,
        neighborhoodDocs: 0,
      },
    )
  }, [payloadCountryGroups])

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
            <p>Browse the live `locations` collection by country first, then drill into city and neighborhood records.</p>
          </div>
          {!isLoading && !error && filteredPayloadRows.length > 0 ? (
            <div className="ldb-country-summary" aria-label="Payload document summary">
              <span className="ldb-country-summary-pill">{formatCount(payloadCountryGroups.length, 'country')}</span>
              <span className="ldb-country-summary-pill">{formatCount(payloadCountryStats.cityDocs, 'city')}</span>
              <span className="ldb-country-summary-pill">{formatCount(payloadCountryStats.neighborhoodDocs, 'neighborhood')}</span>
            </div>
          ) : null}
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
            <div className="ldb-country-groups">
              {payloadCountryGroups.map((countryGroup) => (
                <article key={countryGroup.countryKey} className="ldb-country-group">
                  <div className="ldb-country-group-header">
                    <div className="ldb-country-group-copy">
                      <p className="ldb-country-group-kicker">Country group</p>
                      <div className="ldb-country-group-title-row">
                        <h3>{countryGroup.countryLabel}</h3>
                        <span className="ldb-country-group-count">
                          {formatCount(countryGroup.rows.length, 'document')}
                        </span>
                      </div>
                      <p>
                        {countryGroup.cityGroups.length > 0
                          ? `Includes ${formatCount(countryGroup.cityGroups.length, 'city cluster')}.`
                          : 'Country-level record only.'}
                      </p>
                    </div>
                    <div className="ldb-country-group-stats">
                      <span className="ldb-country-summary-pill">
                        {countryGroup.countryRow ? 'Country doc ready' : 'No country doc'}
                      </span>
                      <span className="ldb-country-summary-pill">{formatCount(countryGroup.cityCount, 'city')}</span>
                      <span className="ldb-country-summary-pill">
                        {formatCount(countryGroup.neighborhoodCount, 'neighborhood')}
                      </span>
                    </div>
                  </div>

                  {countryGroup.countryRow ? (
                    <div className="ldb-country-featured-doc">
                      <div className="ldb-country-featured-doc-main">
                        <span className="ldb-mini-label">Country document</span>
                        <strong>{summarizeLocationIndexRow(countryGroup.countryRow)}</strong>
                        <p>
                          <span>{countryGroup.countryRow.locationKey}</span>
                          <span>Updated {formatDate(countryGroup.countryRow.updatedAt)}</span>
                        </p>
                      </div>
                      <div className="ldb-country-featured-doc-actions">
                        <span className="ldb-status-chip is-country">country</span>
                        <Link className="ldb-link" to={`/location-documents/builder?id=${countryGroup.countryRow.id}`}>
                          Edit country
                        </Link>
                      </div>
                    </div>
                  ) : null}

                  {countryGroup.cityGroups.length > 0 ? (
                    <div className="ldb-city-groups">
                      {countryGroup.cityGroups.map((cityGroup) => (
                        <section key={`${countryGroup.countryKey}-${cityGroup.cityKey}`} className="ldb-city-group">
                          <div className="ldb-city-group-header">
                            <div>
                              <p className="ldb-mini-label">City cluster</p>
                              <h4>{cityGroup.cityLabel}</h4>
                              <p>
                                {cityGroup.cityRow
                                  ? `${formatCount(cityGroup.neighborhoodRows.length, 'neighborhood')} linked to this city.`
                                  : `Neighborhood records only in ${cityGroup.cityLabel}.`}
                              </p>
                            </div>
                            <div className="ldb-city-group-stats">
                              {cityGroup.cityRow ? (
                                <span className="ldb-country-summary-pill">City doc ready</span>
                              ) : (
                                <span className="ldb-country-summary-pill">City doc missing</span>
                              )}
                              <span className="ldb-country-summary-pill">
                                {formatCount(cityGroup.neighborhoodRows.length, 'neighborhood')}
                              </span>
                            </div>
                          </div>

                          <div className="ldb-doc-grid">
                            {cityGroup.rows.map((row) => (
                              <div key={row.id} className="ldb-doc-card">
                                <div className="ldb-doc-card-main">
                                  <div className="ldb-doc-card-title-row">
                                    <strong>{summarizeLocationIndexRow(row)}</strong>
                                    <span className={`ldb-status-chip is-${row.level}`}>{row.level}</span>
                                  </div>
                                  <p className="ldb-doc-card-key">{row.locationKey}</p>
                                  <p className="ldb-doc-card-meta">
                                    <span>Updated {formatDate(row.updatedAt)}</span>
                                    {row.level !== 'country' ? (
                                      <span>
                                        {[row.countryName, row.cityName, row.neighborhoodName]
                                          .filter((value): value is string => Boolean(value?.trim()))
                                          .join(' / ')}
                                      </span>
                                    ) : null}
                                  </p>
                                </div>
                                <Link className="ldb-link" to={`/location-documents/builder?id=${row.id}`}>
                                  Edit
                                </Link>
                              </div>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )
        ) : null}
      </section>
    </div>
  )
}

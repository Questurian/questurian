import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth'
import { fetchLocationsIndex } from '../api'
import { listDrafts, removeDraft } from '../storage'
import type { LocationDocumentDraft, LocationIndexRow } from '../types'
import { groupLocationIndexRowsByCountry, summarizeLocationIndexRow } from '../utils'
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

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function formatLevelLabel(level: LocationIndexRow['level']): string {
  return level.charAt(0).toUpperCase() + level.slice(1)
}

function getLinkedDraftLabel(draft: LocationDocumentDraft): string {
  return `Local changes saved ${formatDate(draft.updatedAt)}`
}

function getLinkedDraftStatus(draft: LocationDocumentDraft): {
  pillLabel?: string
  pillClassName?: string
  title: string
  detail: string
} {
  if (draft.hasUnsyncedPayloadChanges) {
    return {
      pillLabel: 'Resync needed',
      pillClassName: 'is-attention',
      title: 'Unsynced changes',
      detail: `Local changes were made after the last Payload sync${draft.lastPayloadSyncAt ? ` (${formatDate(draft.lastPayloadSyncAt)})` : ''}.`,
    }
  }

  if (draft.lastPayloadSyncAt) {
    return {
      title: 'Local changes saved',
      detail: `Payload synced ${formatDate(draft.lastPayloadSyncAt)}.`,
    }
  }

  return {
    title: 'Local changes saved',
    detail: getLinkedDraftLabel(draft),
  }
}

export default function LocationDocumentsPage() {
  const { token } = useAuth()
  const [payloadRows, setPayloadRows] = useState<LocationIndexRow[]>([])
  const [localDrafts, setLocalDrafts] = useState<LocationDocumentDraft[]>(() => listDrafts())
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const deferredSearchQuery = useDeferredValue(searchQuery)

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
  const localOnlyDrafts = useMemo(
    () => sortedDrafts.filter((draft) => !(typeof draft.payloadId === 'number' && Number.isFinite(draft.payloadId))),
    [sortedDrafts],
  )
  const payloadDraftMap = useMemo(() => {
    return new Map(
      sortedDrafts
        .filter((draft): draft is LocationDocumentDraft & { payloadId: number } => (
          typeof draft.payloadId === 'number' && Number.isFinite(draft.payloadId)
        ))
        .map((draft) => [draft.payloadId, draft]),
    )
  }, [sortedDrafts])

  const filteredPayloadRows = useMemo(() => {
    const normalizedSearchQuery = deferredSearchQuery.trim().toLowerCase()
    if (!normalizedSearchQuery) return payloadRows

    return payloadRows.filter((row) => {
      const searchableText = [
        summarizeLocationIndexRow(row),
        row.countryName || '',
        row.cityName || '',
        row.neighborhoodName || '',
        formatLevelLabel(row.level),
      ]
        .join(' ')
        .toLowerCase()

      return searchableText.includes(normalizedSearchQuery)
    })
  }, [deferredSearchQuery, payloadRows])

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

  const discardUnsupportedLocalRecords = () => {
    const confirmed = window.confirm('Discard unsupported local-only records? This cannot be undone.')
    if (!confirmed) return
    for (const record of localOnlyDrafts) {
      removeDraft(record.draftId)
    }
    setLocalDrafts(listDrafts())
  }

  return (
    <div className="ldb-page">
      <header className="ldb-hero">
        <div>
          <p className="ldb-eyebrow">Questurian Studio</p>
          <h1>Location Documents</h1>
          <p className="ldb-lede">
            Review and update existing Payload `locations` documents with local change tracking and AI-assisted editing.
          </p>
        </div>
        <div className="ldb-hero-actions">
          <Link className="ldb-btn ldb-btn-secondary" to="/">
            Back Home
          </Link>
        </div>
      </header>

      <div className="ldb-search-strip">
        <label className="ldb-search-field" htmlFor="location-documents-search">
          <span className="ldb-search-label">Search locations</span>
          <input
            id="location-documents-search"
            className="ldb-input ldb-search-input"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by country, city, or neighborhood"
          />
        </label>
      </div>

      {localOnlyDrafts.length > 0 ? (
        <section className="ldb-panel">
          <div className="ldb-panel-header">
            <div>
              <h2>Unsupported Local Records ({localOnlyDrafts.length})</h2>
              <p>
                This editor now works only against existing Payload locations. Older local-only records are hidden from the main workflow because they can create conflicts.
              </p>
            </div>
            <button type="button" className="ldb-btn ldb-btn-secondary" onClick={discardUnsupportedLocalRecords}>
              Discard Hidden Records
            </button>
          </div>
        </section>
      ) : null}

      <section className="ldb-panel">
        <div className="ldb-panel-header">
          <div>
            <h2>Payload Locations ({filteredPayloadRows.length})</h2>
            <p>
              Browse the live `locations` collection by country first, then open or resume the local edits tied to each document.
              {!isLoading && !error && filteredPayloadRows.length > 0
                ? ` ${formatCount(payloadCountryGroups.length, 'country')}, ${formatCount(payloadCountryStats.cityDocs, 'city')}, ${formatCount(payloadCountryStats.neighborhoodDocs, 'neighborhood')}.`
                : ''}
            </p>
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
            <div className="ldb-country-groups">
              {payloadCountryGroups.map((countryGroup) => {
                const linkedCountryDraft = countryGroup.countryRow
                  ? payloadDraftMap.get(countryGroup.countryRow.id)
                  : undefined
                const linkedCountrySyncStatus = linkedCountryDraft
                  ? getLinkedDraftStatus(linkedCountryDraft)
                  : null

                return (
                  <article key={countryGroup.countryKey} className="ldb-country-group">
                    <div className="ldb-country-group-header">
                      <div className="ldb-country-group-copy">
                        <p className="ldb-country-group-kicker">Country group</p>
                        <div className="ldb-country-group-title-row">
                          <h3>{countryGroup.countryLabel}</h3>
                        </div>
                        <p>
                          {countryGroup.cityGroups.length > 0
                            ? `${formatCount(countryGroup.rows.length, 'document')}. ${formatCount(countryGroup.cityGroups.length, 'city cluster')}, ${formatCount(countryGroup.cityCount, 'city')}, ${formatCount(countryGroup.neighborhoodCount, 'neighborhood')}.`
                            : `${formatCount(countryGroup.rows.length, 'document')}. Country-level record only.`}
                        </p>
                      </div>
                    </div>

                    {countryGroup.countryRow ? (
                      <div className="ldb-country-featured-doc">
                        <div className="ldb-country-featured-doc-main">
                          <span className="ldb-mini-label">Country document</span>
                          <strong>{summarizeLocationIndexRow(countryGroup.countryRow)}</strong>
                          <p>
                            <span>Updated {formatDate(countryGroup.countryRow.updatedAt)}</span>
                          </p>
                          {linkedCountrySyncStatus ? (
                            <p>
                              <span>{linkedCountrySyncStatus.title}</span>
                              <span>{linkedCountrySyncStatus.detail}</span>
                            </p>
                          ) : null}
                        </div>
                        <div className="ldb-country-featured-doc-actions">
                          {linkedCountrySyncStatus?.pillLabel ? (
                            <span className={`ldb-country-summary-pill${linkedCountrySyncStatus.pillClassName ? ` ${linkedCountrySyncStatus.pillClassName}` : ''}`}>
                              {linkedCountrySyncStatus.pillLabel}
                            </span>
                          ) : null}
                          <Link
                            className="ldb-link"
                            to={linkedCountryDraft
                              ? `/location-documents/builder?draftId=${encodeURIComponent(linkedCountryDraft.draftId)}`
                              : `/location-documents/builder?id=${countryGroup.countryRow.id}`}
                          >
                            {linkedCountryDraft ? 'Resume Edits' : 'Edit'}
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
                                    ? `Official city document available. ${formatCount(cityGroup.neighborhoodRows.length, 'neighborhood')} linked to this city.`
                                    : `Neighborhood records only in ${cityGroup.cityLabel}.`}
                                </p>
                              </div>
                            </div>

                            <div className="ldb-doc-grid">
                              {cityGroup.rows.map((row) => {
                                const linkedDraft = payloadDraftMap.get(row.id)
                                const syncStatus = linkedDraft ? getLinkedDraftStatus(linkedDraft) : null

                                return (
                                  <div key={row.id} className="ldb-doc-card">
                                    <div className="ldb-doc-card-main">
                                      <p className="ldb-doc-card-level">{formatLevelLabel(row.level)}</p>
                                      <div className="ldb-doc-card-title-row">
                                        <strong>{summarizeLocationIndexRow(row)}</strong>
                                      </div>
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
                                      {linkedDraft ? (
                                        <p className="ldb-doc-card-meta">
                                          <span>{syncStatus?.title}</span>
                                          <span>{syncStatus?.detail}</span>
                                        </p>
                                      ) : null}
                                    </div>
                                    <div className="ldb-doc-card-actions">
                                      {syncStatus?.pillLabel ? (
                                        <span className={`ldb-country-summary-pill${syncStatus?.pillClassName ? ` ${syncStatus.pillClassName}` : ''}`}>
                                          {syncStatus?.pillLabel}
                                        </span>
                                      ) : null}
                                      <Link
                                        className="ldb-link"
                                        to={linkedDraft
                                          ? `/location-documents/builder?draftId=${encodeURIComponent(linkedDraft.draftId)}`
                                          : `/location-documents/builder?id=${row.id}`}
                                      >
                                        {linkedDraft ? 'Resume Edits' : 'Edit'}
                                      </Link>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </section>
                        ))}
                      </div>
                    ) : null}
                  </article>
                )
              })}
            </div>
          )
        ) : null}
      </section>
    </div>
  )
}

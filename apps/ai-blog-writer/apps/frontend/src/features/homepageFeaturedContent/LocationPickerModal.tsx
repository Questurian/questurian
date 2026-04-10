import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { fetchLocationsIndex } from '../locationDocuments/api'
import type { LocationIndexRow } from '../locationDocuments/types'

type Props = {
  token: string
  existingLocationIds: number[]
  onSelect: (locationId: number) => Promise<void>
  onClose: () => void
}

function getLocationDisplayLabel(loc: LocationIndexRow): string {
  if (loc.level === 'neighborhood' && loc.neighborhoodName) {
    return loc.cityName ? `${loc.neighborhoodName}, ${loc.cityName}` : loc.neighborhoodName
  }

  return loc.cityName ?? loc.countryName ?? loc.locationKey ?? String(loc.id)
}

export function LocationPickerModal({ token, existingLocationIds, onSelect, onClose }: Props) {
  const [searchValue, setSearchValue] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cityQuery = useQuery({
    queryKey: ['locations-city', token],
    queryFn: () => fetchLocationsIndex(token, { level: 'city' }),
    staleTime: 60_000,
  })

  const neighborhoodQuery = useQuery({
    queryKey: ['locations-neighborhood', token],
    queryFn: () => fetchLocationsIndex(token, { level: 'neighborhood' }),
    staleTime: 60_000,
  })

  const { cities, neighborhoods } = useMemo(() => {
    const existingSet = new Set(existingLocationIds)
    const q = searchValue.trim().toLowerCase()

    function matches(loc: LocationIndexRow): boolean {
      if (existingSet.has(loc.id)) return false
      if (!q) return true
      const label = getLocationDisplayLabel(loc).toLowerCase()
      return label.includes(q) || (loc.locationKey?.toLowerCase().includes(q) ?? false)
    }

    const sortFn = (a: LocationIndexRow, b: LocationIndexRow) =>
      getLocationDisplayLabel(a).localeCompare(getLocationDisplayLabel(b))

    return {
      cities: (cityQuery.data ?? []).filter(matches).sort(sortFn),
      neighborhoods: (neighborhoodQuery.data ?? []).filter(matches).sort(sortFn),
    }
  }, [cityQuery.data, neighborhoodQuery.data, existingLocationIds, searchValue])

  const isLoading = cityQuery.isLoading || neighborhoodQuery.isLoading
  const totalResults = cities.length + neighborhoods.length

  async function handleSelect(locationId: number) {
    setIsSubmitting(true)
    setError(null)

    try {
      await onSelect(locationId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create location homepage.')
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="hf-modal-backdrop" onClick={onClose}>
      <div
        className="hf-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add Location Homepage"
      >
        {/* ── Header ─────────────────────────────────────── */}
        <div className="hf-modal-top">
          <div className="hf-modal-title-row">
            <h2>Add Location Homepage</h2>
            <button
              type="button"
              className="hf-modal-close"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="hf-modal-search">
            <span className="hf-modal-search-icon">⌕</span>
            <input
              type="search"
              placeholder="Search cities or neighborhoods…"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
          </div>

          {error && <p className="hf-modal-error">{error}</p>}
        </div>

        {/* ── Body ───────────────────────────────────────── */}
        <div className="hf-modal-body">
          {isLoading ? (
            <p className="hf-modal-empty">Loading locations…</p>
          ) : totalResults === 0 ? (
            <p className="hf-modal-empty">
              {searchValue.trim()
                ? 'No locations matched your search.'
                : 'All available cities and neighborhoods already have a homepage.'}
            </p>
          ) : (
            <>
              {cities.length > 0 && (
                <>
                  <div className="hf-modal-group">Cities · {cities.length}</div>
                  {cities.map((loc) => (
                    <button
                      key={loc.id}
                      type="button"
                      className="hf-modal-row"
                      onClick={() => handleSelect(loc.id)}
                      disabled={isSubmitting}
                    >
                      <span className="hf-modal-row-name">{getLocationDisplayLabel(loc)}</span>
                      <span className="hf-modal-row-meta">
                        {loc.locationKey && (
                          <span className="hf-modal-row-key">{loc.locationKey}</span>
                        )}
                        <span className="hf-level-tag">city</span>
                      </span>
                    </button>
                  ))}
                </>
              )}

              {neighborhoods.length > 0 && (
                <>
                  <div className="hf-modal-group">Neighborhoods · {neighborhoods.length}</div>
                  {neighborhoods.map((loc) => (
                    <button
                      key={loc.id}
                      type="button"
                      className="hf-modal-row"
                      onClick={() => handleSelect(loc.id)}
                      disabled={isSubmitting}
                    >
                      <span className="hf-modal-row-name">{getLocationDisplayLabel(loc)}</span>
                      <span className="hf-modal-row-meta">
                        {loc.locationKey && (
                          <span className="hf-modal-row-key">{loc.locationKey}</span>
                        )}
                        <span className="hf-level-tag">neighborhood</span>
                      </span>
                    </button>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

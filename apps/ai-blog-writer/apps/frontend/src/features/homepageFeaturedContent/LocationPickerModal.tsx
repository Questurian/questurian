import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { fetchLocationsIndex } from '../locationDocuments/api'
import type { LocationIndexRow } from '../locationDocuments/types'

const LOCATION_COLLATOR = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
})

type ModalCityGroup = {
  key: string
  cityLabel: string
  city: LocationIndexRow | null
  neighborhoods: LocationIndexRow[]
}

type ModalCountryGroup = {
  key: string
  countryLabel: string
  cityGroups: ModalCityGroup[]
}

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

function normalizeGroupValue(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return ''
}

function getCountryLabel(loc: LocationIndexRow): string {
  const keyParts = loc.locationKey?.split('|') ?? []
  return normalizeGroupValue(loc.countryName, loc.country, keyParts[0]) || 'Unassigned country'
}

function getCityLabel(loc: LocationIndexRow): string {
  const keyParts = loc.locationKey?.split('|') ?? []
  return normalizeGroupValue(loc.cityName, loc.city, keyParts[1]) || 'Unassigned city'
}

function getLocationSearchText(loc: LocationIndexRow): string {
  return [
    getLocationDisplayLabel(loc),
    loc.countryName,
    loc.cityName,
    loc.neighborhoodName,
    loc.locationKey,
    loc.level,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' ')
    .toLowerCase()
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

  const groupedLocations = useMemo(() => {
    const existingSet = new Set(existingLocationIds)
    const q = searchValue.trim().toLowerCase()
    const countryMap = new Map<
      string,
      ModalCountryGroup & { cityMap: Map<string, ModalCityGroup> }
    >()

    const insertCity = (loc: LocationIndexRow) => {
      const countryLabel = getCountryLabel(loc)
      const cityLabel = getCityLabel(loc)
      const countryKey = countryLabel.toLowerCase()
      const cityKey = `${countryKey}::${cityLabel.toLowerCase()}`

      let countryGroup = countryMap.get(countryKey)
      if (!countryGroup) {
        countryGroup = {
          key: countryKey,
          countryLabel,
          cityGroups: [],
          cityMap: new Map<string, ModalCityGroup>(),
        }
        countryMap.set(countryKey, countryGroup)
      }

      let cityGroup = countryGroup.cityMap.get(cityKey)
      if (!cityGroup) {
        cityGroup = {
          key: cityKey,
          cityLabel,
          city: null,
          neighborhoods: [],
        }
        countryGroup.cityMap.set(cityKey, cityGroup)
        countryGroup.cityGroups.push(cityGroup)
      }

      if (loc.level === 'city') {
        cityGroup.city = loc
      } else {
        cityGroup.neighborhoods.push(loc)
      }
    }

    for (const city of cityQuery.data ?? []) {
      if (existingSet.has(city.id)) continue
      insertCity(city)
    }

    for (const neighborhood of neighborhoodQuery.data ?? []) {
      if (existingSet.has(neighborhood.id)) continue
      insertCity(neighborhood)
    }

    return Array.from(countryMap.values())
      .map((countryGroup) => {
        const cityGroups = countryGroup.cityGroups
          .map((cityGroup) => {
            const cityMatches = q.length === 0
              || [
                countryGroup.countryLabel,
                cityGroup.cityLabel,
                cityGroup.city?.locationKey,
              ]
                .filter((value): value is string => Boolean(value?.trim()))
                .join(' ')
                .toLowerCase()
                .includes(q)

            const matchingNeighborhoods = q.length === 0 || cityMatches
              ? cityGroup.neighborhoods
              : cityGroup.neighborhoods.filter((loc) => getLocationSearchText(loc).includes(q))

            if (!cityMatches && matchingNeighborhoods.length === 0) {
              return null
            }

            return {
              ...cityGroup,
              neighborhoods: [...matchingNeighborhoods].sort((left, right) =>
                LOCATION_COLLATOR.compare(
                  getLocationDisplayLabel(left),
                  getLocationDisplayLabel(right),
                ),
              ),
            }
          })
          .filter((group): group is ModalCityGroup => group !== null)
          .sort((left, right) => LOCATION_COLLATOR.compare(left.cityLabel, right.cityLabel))

        if (cityGroups.length === 0) return null

        return {
          key: countryGroup.key,
          countryLabel: countryGroup.countryLabel,
          cityGroups,
        }
      })
      .filter((group): group is ModalCountryGroup => group !== null)
      .sort((left, right) => LOCATION_COLLATOR.compare(left.countryLabel, right.countryLabel))
  }, [cityQuery.data, neighborhoodQuery.data, existingLocationIds, searchValue])

  const isLoading = cityQuery.isLoading || neighborhoodQuery.isLoading
  const totalResults = groupedLocations.reduce(
    (total, countryGroup) => total + countryGroup.cityGroups.reduce(
      (cityTotal, cityGroup) => cityTotal + (cityGroup.city ? 1 : 0) + cityGroup.neighborhoods.length,
      0,
    ),
    0,
  )

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
            groupedLocations.map((countryGroup) => (
              <section key={countryGroup.key} className="hf-modal-country-group">
                <div className="hf-modal-group">{countryGroup.countryLabel}</div>

                {countryGroup.cityGroups.map((cityGroup) => (
                  <div key={cityGroup.key} className="hf-modal-city-group">
                    <div className="hf-modal-city-group-header">
                      <div>
                        <p className="hf-modal-city-group-kicker">City</p>
                        <h3>{cityGroup.cityLabel}</h3>
                      </div>
                    </div>

                    {cityGroup.city ? (
                      <button
                        type="button"
                        className="hf-modal-row hf-modal-row-city"
                        onClick={() => handleSelect(cityGroup.city!.id)}
                        disabled={isSubmitting}
                      >
                        <span className="hf-modal-row-copy">
                          <span className="hf-modal-row-name">{getLocationDisplayLabel(cityGroup.city)}</span>
                        </span>
                        <span className="hf-modal-row-meta">
                          {cityGroup.city.locationKey && (
                            <span className="hf-modal-row-key">{cityGroup.city.locationKey}</span>
                          )}
                          <span className="hf-level-tag">city</span>
                        </span>
                      </button>
                    ) : null}

                    {cityGroup.neighborhoods.length > 0 ? (
                      <div className="hf-modal-neighborhood-stack">
                        <div className="hf-modal-neighborhood-label">Neighborhoods</div>
                        {cityGroup.neighborhoods.map((loc) => (
                          <button
                            key={loc.id}
                            type="button"
                            className="hf-modal-row hf-modal-row-child"
                            onClick={() => handleSelect(loc.id)}
                            disabled={isSubmitting}
                          >
                            <span className="hf-modal-row-copy">
                              <span className="hf-modal-row-name">{getLocationDisplayLabel(loc)}</span>
                            </span>
                            <span className="hf-modal-row-meta">
                              {loc.locationKey && (
                                <span className="hf-modal-row-key">{loc.locationKey}</span>
                              )}
                              <span className="hf-level-tag">neighborhood</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

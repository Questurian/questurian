import { useEffect, useDeferredValue, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import './homepageFeaturedContent.css'

import { useAuth } from '../auth'
import {
  createLocationHomepage,
  deleteLocationHomepage,
  fetchLocationHomepagesList,
  toggleLocationHomepage,
  type LocationHomepageListItem,
  type LocationRef,
} from './locationHomepagesApi'
import { LocationPickerModal } from './LocationPickerModal'

const LOCATION_COLLATOR = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
})
const EMPTY_LOCATION_HOMEPAGES: LocationHomepageListItem[] = []

type CityHomepageGroup = {
  key: string
  cityLabel: string
  cityHomepage: LocationHomepageListItem | null
  neighborhoodHomepages: LocationHomepageListItem[]
}

type CountryHomepageGroup = {
  key: string
  countryLabel: string
  cityGroups: CityHomepageGroup[]
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return value
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getLocationLabel(item: LocationHomepageListItem): string {
  const loc = item.location
  if (!loc) return `Homepage #${item.id}`

  if (loc.neighborhoodName) {
    return loc.cityName ? `${loc.neighborhoodName}, ${loc.cityName}` : loc.neighborhoodName
  }

  return loc.cityName ?? loc.countryName ?? `Homepage #${item.id}`
}

function getLocationPrimaryLabel(item: LocationHomepageListItem): string {
  const loc = item.location
  if (!loc) return `Homepage #${item.id}`

  if (loc.level === 'neighborhood') {
    return loc.neighborhoodName?.trim() || getLocationLabel(item)
  }

  if (loc.level === 'city') {
    return loc.cityName?.trim() || getLocationLabel(item)
  }

  return getLocationLabel(item)
}

function normalizeGroupValue(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return ''
}

function getCountryLabel(location: LocationRef | null): string {
  if (!location) return 'Unassigned country'
  const keyParts = location.locationKey?.split('|') ?? []
  return normalizeGroupValue(location.countryName, keyParts[0]) || 'Unassigned country'
}

function getCityLabel(location: LocationRef | null): string {
  if (!location) return 'Unassigned city'
  const keyParts = location.locationKey?.split('|') ?? []
  return normalizeGroupValue(location.cityName, keyParts[1]) || 'Unassigned city'
}

function toGroupKey(label: string, fallback: string): string {
  const normalized = label.trim().toLowerCase()
  return normalized || fallback
}

function getItemSearchText(item: LocationHomepageListItem): string {
  const location = item.location

  return [
    getLocationLabel(item),
    getLocationPrimaryLabel(item),
    location?.countryName,
    location?.cityName,
    location?.neighborhoodName,
    location?.locationKey,
    location?.level,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' ')
    .toLowerCase()
}

function compareItems(left: LocationHomepageListItem, right: LocationHomepageListItem): number {
  if (left.isEnabled !== right.isEnabled) {
    return left.isEnabled ? -1 : 1
  }

  const labelComparison = LOCATION_COLLATOR.compare(
    getLocationPrimaryLabel(left),
    getLocationPrimaryLabel(right),
  )
  if (labelComparison !== 0) return labelComparison

  return left.id - right.id
}


function buildHomepageGroups(
  items: LocationHomepageListItem[],
): CountryHomepageGroup[] {
  const countryMap = new Map<
    string,
    CountryHomepageGroup & { cityMap: Map<string, CityHomepageGroup> }
  >()

  for (const item of items) {
    const countryLabel = getCountryLabel(item.location)
    const cityLabel = getCityLabel(item.location)
    const countryKey = toGroupKey(countryLabel, `country:${item.id}`)
    const cityKey = `${countryKey}::${toGroupKey(cityLabel, `city:${item.id}`)}`

    let countryGroup = countryMap.get(countryKey)
    if (!countryGroup) {
      countryGroup = {
        key: countryKey,
        countryLabel,
        cityGroups: [],
        cityMap: new Map<string, CityHomepageGroup>(),
      }
      countryMap.set(countryKey, countryGroup)
    }

    let cityGroup = countryGroup.cityMap.get(cityKey)
    if (!cityGroup) {
      cityGroup = {
        key: cityKey,
        cityLabel,
        cityHomepage: null,
        neighborhoodHomepages: [],
      }
      countryGroup.cityMap.set(cityKey, cityGroup)
      countryGroup.cityGroups.push(cityGroup)
    }

    if (item.location?.level === 'city') {
      cityGroup.cityHomepage = item
      continue
    }

    cityGroup.neighborhoodHomepages.push(item)
  }

  return Array.from(countryMap.values())
    .map((countryGroup) => ({
      key: countryGroup.key,
      countryLabel: countryGroup.countryLabel,
      cityGroups: countryGroup.cityGroups
        .map((cityGroup) => ({
          ...cityGroup,
          neighborhoodHomepages: [...cityGroup.neighborhoodHomepages].sort(compareItems),
        }))
        .sort((left, right) => LOCATION_COLLATOR.compare(left.cityLabel, right.cityLabel)),
    }))
    .sort((left, right) => LOCATION_COLLATOR.compare(left.countryLabel, right.countryLabel))
}

type LocationRowProps = {
  item: LocationHomepageListItem
  isEditMode: boolean
  onRequestDelete: (id: number) => void
  onToggle: (id: number) => void
  isToggling: boolean
}

function LocationRow({
  item,
  isEditMode,
  onRequestDelete,
  onToggle,
  isToggling,
}: LocationRowProps) {
  const label = getLocationPrimaryLabel(item)

  return (
    <div className={`hf-location-row${isEditMode ? ' is-edit-mode' : ''}`}>
      <div className="hf-location-row-left">
        <span className={`hf-row-dot ${item.isEnabled ? 'on' : 'off'}`} />
        <span className="hf-location-row-name">{label}</span>
        <span className="hf-level-tag">{item.location?.level ?? '?'}</span>
      </div>
      <div className="hf-location-row-right">
        <span className="hf-location-row-date">{formatDate(item.updatedAt)}</span>
        <button
          type="button"
          className="hf-btn-ghost hf-delete-trigger"
          onClick={() => onToggle(item.id)}
          disabled={isToggling}
          tabIndex={isEditMode ? 0 : -1}
        >
          {isToggling ? 'Updating…' : item.isEnabled ? 'Disable' : 'Enable'}
        </button>
        <Link to={`/homepage-featured-content/${item.id}`} className="hf-btn-ghost">
          Edit
        </Link>
        <button
          type="button"
          className="hf-btn-icon danger hf-delete-trigger"
          title="Delete homepage"
          tabIndex={isEditMode ? 0 : -1}
          onClick={() => onRequestDelete(item.id)}
        >
          ×
        </button>
      </div>
    </div>
  )
}

function DeleteConfirmModal({
  item,
  onConfirm,
  onCancel,
  isDeleting,
  error,
}: {
  item: LocationHomepageListItem
  onConfirm: () => void
  onCancel: () => void
  isDeleting: boolean
  error: string | null
}) {
  const label = getLocationLabel(item)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isDeleting) onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel, isDeleting])

  return (
    <div className="hf-modal-backdrop" onClick={!isDeleting ? onCancel : undefined}>
      <div
        className="hf-modal hf-delete-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hf-delete-title"
      >
        <div className="hf-delete-modal-body">
          <div className="hf-delete-modal-icon">⚠</div>
          <h3 id="hf-delete-title">Delete location homepage?</h3>
          <p>
            You're about to permanently delete the homepage for{' '}
            <strong>{label}</strong>. This will remove all associated content
            blocks and cannot be undone.
          </p>
          {error && <p className="hf-modal-error">{error}</p>}
        </div>
        <div className="hf-delete-modal-actions">
          <button
            type="button"
            className="hf-btn-ghost"
            onClick={onCancel}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="hf-btn-primary hf-btn-danger"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting…' : 'Delete homepage'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function HomepageFeaturedContentPage() {
  const { token, user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const canManage = user?.role === 'admin' || user?.role === 'editor'

  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [editingCountryKey, setEditingCountryKey] = useState<string | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null)
  const [searchValue, setSearchValue] = useState('')
  const deferredSearchValue = useDeferredValue(searchValue)

  const listQueryKey = ['location-homepages-list', token]

  const listQuery = useQuery({
    queryKey: listQueryKey,
    queryFn: () => fetchLocationHomepagesList(token!),
    enabled: Boolean(token && canManage),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id }: { id: number }) => toggleLocationHomepage(token!, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listQueryKey }),
  })

  const deleteMutation = useMutation({
    mutationFn: ({ id }: { id: number }) => deleteLocationHomepage(token!, id),
    onSuccess: () => {
      setDeleteTargetId(null)
      queryClient.invalidateQueries({ queryKey: listQueryKey })
    },
  })

  async function handlePickLocation(locationId: number) {
    const result = await createLocationHomepage(token!, locationId)
    queryClient.invalidateQueries({ queryKey: listQueryKey })
    setIsPickerOpen(false)
    navigate(`/homepage-featured-content/${result.id}`)
  }

  const locationHomepages = listQuery.data ?? EMPTY_LOCATION_HOMEPAGES
  const deleteTarget = deleteTargetId !== null
    ? locationHomepages.find((h) => h.id === deleteTargetId) ?? null
    : null
  const deleteError = deleteMutation.isError
    ? (deleteMutation.error instanceof Error ? deleteMutation.error.message : 'Failed to delete.')
    : null

  const existingLocationIds = locationHomepages
    .map((item) => item.location?.id)
    .filter((id): id is number => typeof id === 'number')

  const enabledCount = locationHomepages.filter((h) => h.isEnabled).length
  const homepageGroups = useMemo(
    () => buildHomepageGroups(locationHomepages),
    [locationHomepages],
  )
  const visibleGroups = useMemo(() => {
    const normalizedQuery = deferredSearchValue.trim().toLowerCase()
    if (!normalizedQuery) return homepageGroups

    return homepageGroups
      .map((countryGroup) => {
        const countryMatches = countryGroup.countryLabel.toLowerCase().includes(normalizedQuery)
        const cityGroups = countryGroup.cityGroups.flatMap((cityGroup) => {
          const citySearchText = [
            cityGroup.cityLabel,
            cityGroup.cityHomepage?.location?.locationKey,
            countryGroup.countryLabel,
          ]
            .filter((value): value is string => Boolean(value?.trim()))
            .join(' ')
            .toLowerCase()

          if (countryMatches || citySearchText.includes(normalizedQuery)) {
            return [cityGroup]
          }

          const matchingNeighborhoods = cityGroup.neighborhoodHomepages.filter((item) =>
            getItemSearchText(item).includes(normalizedQuery),
          )

          if (matchingNeighborhoods.length === 0) {
            return []
          }

          return [{
            ...cityGroup,
            neighborhoodHomepages: matchingNeighborhoods,
          }]
        })

        if (cityGroups.length === 0) return []

        return [{
          ...countryGroup,
          cityGroups,
        }]
      })
      .flat()
  }, [deferredSearchValue, homepageGroups])
  if (!canManage) {
    return (
      <div className="hf-page">
        <div className="hf-state-screen">
          <h2>Homepages</h2>
          <p>Only admin and editor accounts can manage homepages.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="hf-page">
      {/* ── Hero ───────────────────────────────────────────── */}
      <header className="hf-hero">
        <div className="hf-hero-copy">
          <p className="hf-kicker">Structured Publishing</p>
          <h1>Homepage Manager</h1>
          <p className="hf-hero-desc">
            Manage the main domain homepage and create curated homepages for specific cities and
            neighborhoods. Each homepage is built from content blocks.
          </p>
        </div>
        <div className="hf-hero-badges">
          <span className="hf-badge muted">
            {locationHomepages.length} location homepage{locationHomepages.length !== 1 ? 's' : ''}
          </span>
          <span className={`hf-badge ${enabledCount > 0 ? 'success' : 'muted'}`}>
            {enabledCount} enabled
          </span>
        </div>
      </header>

      {/* ── Main Homepage ──────────────────────────────────── */}
      <section className="hf-hub-section">
        <h2 style={{ margin: '0 0 var(--space-3)' }}>Main Homepage</h2>
        <div className="hf-hub-card main">
          <div className="hf-hub-card-left">
            <div className="hf-hub-card-icon">🌐</div>
            <div className="hf-hub-card-body">
              <div className="hf-hub-card-name">
                <span className="hf-level-tag">global</span>
                <strong>domain.com</strong>
                <span className="hf-enabled-tag on">Always active</span>
              </div>
              <p className="hf-hub-card-desc">
                Default homepage content shown on the main domain. Requires exactly 10 featured
                items.
              </p>
            </div>
          </div>
          <div className="hf-hub-card-actions">
            <Link to="/homepage-featured-content/main" className="hf-btn-primary">
              Edit content
            </Link>
          </div>
        </div>
      </section>

      {/* ── Location Homepages ─────────────────────────────── */}
      <section className="hf-hub-section">
        <div className="hf-hub-section-header">
          <h2>Location Homepages</h2>
          <button
            type="button"
            className="hf-btn-primary"
            onClick={() => setIsPickerOpen(true)}
          >
            + Add location
          </button>
        </div>

        {listQuery.isLoading ? (
          <div className="hf-state-screen">
            <p>Loading location homepages…</p>
          </div>
        ) : listQuery.error ? (
          <div className="hf-state-screen">
            <p>
              {listQuery.error instanceof Error
                ? listQuery.error.message
                : 'Failed to load location homepages.'}
            </p>
          </div>
        ) : locationHomepages.length === 0 ? (
          <div className="hf-state-screen">
            <p>
              No location homepages yet. Click <strong>+ Add location</strong> to create one for a
              specific city or neighborhood.
            </p>
          </div>
        ) : (
          <>
            <div className="hf-hub-controls">
              <input
                id="homepage-location-search"
                className="hf-hub-search-input"
                type="search"
                aria-label="Search location homepages"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search country, city, neighborhood, or key"
              />
            </div>

            {visibleGroups.length === 0 ? (
              <div className="hf-state-screen">
                <p>
                  No location homepages matched <strong>{searchValue.trim()}</strong>. Try a city,
                  neighborhood, country, or location key.
                </p>
              </div>
            ) : (
              <div className="hf-country-group-list">
                {visibleGroups.map((countryGroup) => {
                  const isEditing = editingCountryKey === countryGroup.key
                  return (
                    <div key={countryGroup.key} className="hf-country-section">
                      <div className="hf-country-section-header">
                        <h3 className="hf-country-section-name">{countryGroup.countryLabel}</h3>
                        <button
                          type="button"
                          className={`hf-country-edit-btn${isEditing ? ' is-done' : ''}`}
                          onClick={() =>
                            setEditingCountryKey(isEditing ? null : countryGroup.key)
                          }
                        >
                          {isEditing ? 'Done' : '⚙'}
                        </button>
                      </div>

                      <div className="hf-city-block-list">
                        {countryGroup.cityGroups.map((cityGroup) => {
                          const cityMissingHomepage =
                            cityGroup.cityHomepage === null
                            && cityGroup.neighborhoodHomepages.length > 0

                          return (
                            <div key={cityGroup.key} className="hf-city-block">
                              <div className={`hf-city-block-header${cityMissingHomepage ? ' is-missing' : ''}`}>
                                <h4 className="hf-city-block-name">{cityGroup.cityLabel}</h4>
                                {cityMissingHomepage && (
                                  <span className="hf-city-missing-hint">No city homepage</span>
                                )}
                              </div>

                              <div className="hf-location-rows">
                                {cityGroup.cityHomepage && (
                                  <LocationRow
                                    item={cityGroup.cityHomepage}
                                    isEditMode={isEditing}
                                    onRequestDelete={setDeleteTargetId}
                                    onToggle={(id) => toggleMutation.mutate({ id })}
                                    isToggling={
                                      toggleMutation.isPending
                                      && (toggleMutation.variables as { id: number } | undefined)
                                        ?.id === cityGroup.cityHomepage.id
                                    }
                                  />
                                )}

                                {cityGroup.neighborhoodHomepages.map((item) => (
                                  <LocationRow
                                    key={item.id}
                                    item={item}
                                    isEditMode={isEditing}
                                    onRequestDelete={setDeleteTargetId}
                                    onToggle={(id) => toggleMutation.mutate({ id })}
                                    isToggling={
                                      toggleMutation.isPending
                                      && (toggleMutation.variables as { id: number } | undefined)
                                        ?.id === item.id
                                    }
                                  />
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </section>

      {isPickerOpen && (
        <LocationPickerModal
          token={token!}
          existingLocationIds={existingLocationIds}
          onSelect={handlePickLocation}
          onClose={() => setIsPickerOpen(false)}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          item={deleteTarget}
          onConfirm={() => deleteMutation.mutate({ id: deleteTarget.id })}
          onCancel={() => {
            if (!deleteMutation.isPending) {
              setDeleteTargetId(null)
              deleteMutation.reset()
            }
          }}
          isDeleting={deleteMutation.isPending}
          error={deleteError}
        />
      )}
    </div>
  )
}

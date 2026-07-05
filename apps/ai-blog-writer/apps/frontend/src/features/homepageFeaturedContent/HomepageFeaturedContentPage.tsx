import { useDeferredValue, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import './homepageFeaturedContent.css'

import { useAuth, usePermissions } from '../auth'
import {
  createLocationHomepage,
  deleteLocationHomepage,
  fetchLocationHomepagesList,
  resetAllHomepageContent,
  toggleLocationHomepage,
  type LocationHomepageListItem,
} from './locationHomepages'
import { LocationPickerModal } from './LocationPickerModal'
import { LocationHomepageRow } from './components/LocationHomepageRow'
import { DeleteLocationHomepageModal } from './components/DeleteLocationHomepageModal'
import { ResetAllHomepageContentModal } from './components/ResetAllHomepageContentModal'
import { buildHomepageGroups, filterHomepageGroups } from './locationHomepageList.utils'

const EMPTY_LOCATION_HOMEPAGES: LocationHomepageListItem[] = []

export default function HomepageFeaturedContentPage() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canManagePublished: canManage } = usePermissions()

  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [isResetAllOpen, setIsResetAllOpen] = useState(false)
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

  const resetAllMutation = useMutation({
    mutationFn: () => resetAllHomepageContent(token!),
    onSuccess: () => {
      setIsResetAllOpen(false)
      queryClient.invalidateQueries({ queryKey: listQueryKey })
      queryClient.invalidateQueries({ queryKey: ['main-homepage'] })
      queryClient.invalidateQueries({ queryKey: ['location-homepage'] })
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
  const resetAllError = resetAllMutation.isError
    ? (resetAllMutation.error instanceof Error
      ? resetAllMutation.error.message
      : 'Failed to clear homepage content.')
    : null

  const existingLocationIds = locationHomepages
    .map((item) => item.location?.id)
    .filter((id): id is number => typeof id === 'number')

  const enabledCount = locationHomepages.filter((h) => h.isEnabled).length
  const homepageGroups = useMemo(
    () => buildHomepageGroups(locationHomepages),
    [locationHomepages],
  )
  const visibleGroups = useMemo(
    () => filterHomepageGroups(homepageGroups, deferredSearchValue),
    [deferredSearchValue, homepageGroups],
  )
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
          <button
            type="button"
            className="hf-btn-primary hf-btn-danger"
            onClick={() => setIsResetAllOpen(true)}
          >
            Clear all page data
          </button>
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
                                  <LocationHomepageRow
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
                                  <LocationHomepageRow
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
        <DeleteLocationHomepageModal
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

      {isResetAllOpen && (
        <ResetAllHomepageContentModal
          onConfirm={() => resetAllMutation.mutate()}
          onCancel={() => {
            if (!resetAllMutation.isPending) {
              setIsResetAllOpen(false)
              resetAllMutation.reset()
            }
          }}
          isResetting={resetAllMutation.isPending}
          error={resetAllError}
        />
      )}
    </div>
  )
}

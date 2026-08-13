import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import './homepageFeaturedContent.css'

import { useAuth, usePermissions } from '../auth'
import {
  deleteLocationHomepage,
  fetchLocationHomepagesList,
  toggleLocationHomepage,
  type LocationHomepageListItem,
} from './locationHomepages'
import { LocationHomepageRow } from './components/LocationHomepageRow'
import { DeleteLocationHomepageModal } from './components/DeleteLocationHomepageModal'
import { buildHomepageGroups } from './locationHomepageList.utils'

const EMPTY_LOCATION_HOMEPAGES: LocationHomepageListItem[] = []

export default function HomepageFeaturedContentPage() {
  const { isAuthenticated, user } = useAuth()
  const queryClient = useQueryClient()
  const { canManagePublished: canManage } = usePermissions()

  const [editingCountryKey, setEditingCountryKey] = useState<string | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null)

  const listQueryKey = ['location-homepages-list', user?.id ?? 'anonymous']

  const listQuery = useQuery({
    queryKey: listQueryKey,
    queryFn: () => fetchLocationHomepagesList(),
    enabled: isAuthenticated && canManage,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id }: { id: number }) => toggleLocationHomepage(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listQueryKey }),
  })

  const deleteMutation = useMutation({
    mutationFn: ({ id }: { id: number }) => deleteLocationHomepage(id),
    onSuccess: () => {
      setDeleteTargetId(null)
      queryClient.invalidateQueries({ queryKey: listQueryKey })
    },
  })

  const locationHomepages = listQuery.data ?? EMPTY_LOCATION_HOMEPAGES
  const deleteTarget = deleteTargetId !== null
    ? locationHomepages.find((h) => h.id === deleteTargetId) ?? null
    : null
  const deleteError = deleteMutation.isError
    ? (deleteMutation.error instanceof Error ? deleteMutation.error.message : 'Failed to delete.')
    : null
  const homepageGroups = useMemo(
    () => buildHomepageGroups(locationHomepages),
    [locationHomepages],
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
          <h1>Homepage Manager</h1>
          <p className="hf-hero-desc">
            Manage the main domain homepage and create curated homepages for specific cities and
            neighborhoods. Each homepage is built from content blocks.
          </p>
        </div>
      </header>

      {/* ── Main Homepage ──────────────────────────────────── */}
      <section className="hf-hub-section">
        <div className="hf-hub-section-header">
          <h2>Main Homepage</h2>
        </div>
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
            <p>No location homepages yet.</p>
          </div>
        ) : (
          <div className="hf-country-group-list">
            {homepageGroups.map((countryGroup) => {
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
                      {isEditing ? 'Done' : 'Manage'}
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
      </section>

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
    </div>
  )
}

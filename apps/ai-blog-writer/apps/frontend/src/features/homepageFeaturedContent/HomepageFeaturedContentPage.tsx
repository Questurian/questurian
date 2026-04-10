import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import './homepageFeaturedContent.css'

import { useAuth } from '../../providers/useAuth'
import {
  createLocationHomepage,
  deleteLocationHomepage,
  fetchLocationHomepagesList,
  toggleLocationHomepage,
  type LocationHomepageListItem,
} from './locationHomepagesApi'
import { LocationPickerModal } from './LocationPickerModal'

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

export default function HomepageFeaturedContentPage() {
  const { token, user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const canManage = user?.role === 'admin' || user?.role === 'editor'

  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

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
      setConfirmDeleteId(null)
      queryClient.invalidateQueries({ queryKey: listQueryKey })
    },
  })

  async function handlePickLocation(locationId: number) {
    const result = await createLocationHomepage(token!, locationId)
    queryClient.invalidateQueries({ queryKey: listQueryKey })
    setIsPickerOpen(false)
    navigate(`/homepage-featured-content/${result.id}`)
  }

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

  const locationHomepages = listQuery.data ?? []
  const existingLocationIds = locationHomepages
    .map((item) => item.location?.id)
    .filter((id): id is number => typeof id === 'number')

  const enabledCount = locationHomepages.filter((h) => h.isEnabled).length

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
          <div className="hf-hub-grid">
            {locationHomepages.map((item) => {
              const label = getLocationLabel(item)
              const isDeleting = deleteMutation.isPending && confirmDeleteId === item.id
              const isToggling =
                toggleMutation.isPending &&
                (toggleMutation.variables as { id: number } | undefined)?.id === item.id

              return (
                <div key={item.id} className="hf-hub-card">
                  <div className="hf-hub-card-left">
                    <div className="hf-hub-card-icon">
                      {item.location?.level === 'neighborhood' ? '🏘' : '🏙'}
                    </div>
                    <div className="hf-hub-card-body">
                      <div className="hf-hub-card-name">
                        <span className="hf-level-tag">{item.location?.level ?? '?'}</span>
                        <strong>{label}</strong>
                        <span className={`hf-enabled-tag ${item.isEnabled ? 'on' : 'off'}`}>
                          {item.isEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      {item.location?.locationKey && (
                        <span className="hf-hub-card-key">{item.location.locationKey}</span>
                      )}
                      <p className="hf-hub-card-desc">Updated {formatDate(item.updatedAt)}</p>
                    </div>
                  </div>

                  <div className="hf-hub-card-actions">
                    {confirmDeleteId === item.id ? (
                      <div className="hf-confirm-row">
                        <span className="hf-confirm-text">Delete this homepage?</span>
                        <button
                          type="button"
                          className="hf-btn-ghost danger"
                          onClick={() => deleteMutation.mutate({ id: item.id })}
                          disabled={isDeleting}
                        >
                          {isDeleting ? 'Deleting…' : 'Confirm'}
                        </button>
                        <button
                          type="button"
                          className="hf-btn-ghost"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="hf-btn-ghost"
                          onClick={() => toggleMutation.mutate({ id: item.id })}
                          disabled={isToggling}
                        >
                          {isToggling ? 'Updating…' : item.isEnabled ? 'Disable' : 'Enable'}
                        </button>
                        <Link
                          to={`/homepage-featured-content/${item.id}`}
                          className="hf-btn-primary"
                        >
                          Edit
                        </Link>
                        <button
                          type="button"
                          className="hf-btn-icon danger"
                          title="Delete"
                          onClick={() => setConfirmDeleteId(item.id)}
                        >
                          ×
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
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
    </div>
  )
}

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { MediaSet, MediaSetPatch } from '../../../shared/api/payload/payload.types'
import { fetchLocations } from '../../../shared/api/payload/payload.api'
import type { BrowseFilters } from '../types'
import { computeHealth } from './HealthScore'
import { FilterBar } from './FilterBar'
import { MediaSetCard } from './MediaSetCard'
import { MediaSetSidePanel } from './MediaSetSidePanel'
import { useBrowseMediaSets } from '../hooks/useMediaSets'
import { useUpdateMediaSet } from '../hooks/useUpdateMediaSet'

const EMPTY_FILTERS: BrowseFilters = {
  search: '',
  status: '',
  locationId: null,
  missingField: '',
}

type Props = { token: string }

export function BrowseTab({ token }: Props) {
  const [filters, setFilters] = useState<BrowseFilters>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<MediaSet | null>(null)

  const { data, isLoading, isError } = useBrowseMediaSets(token, filters, page)
  const updateMutation = useUpdateMediaSet(token)

  const { data: locationsData } = useQuery({
    queryKey: ['locations'],
    queryFn: () => fetchLocations(token),
    enabled: !!token,
  })
  const locations = locationsData?.docs ?? []

  const mediaSets = data?.docs ?? []
  const totalPages = data?.totalPages ?? 1
  const totalDocs = data?.totalDocs ?? 0

  const handleFilterChange = (next: BrowseFilters) => {
    setFilters(next)
    setPage(1)
    setSelected(null)
  }

  const handleSave = async (patch: MediaSetPatch) => {
    if (!selected) return
    await updateMutation.mutateAsync({ id: selected.id, patch })
  }

  return (
    <div className={`ml-browse ${selected ? 'with-panel' : ''}`}>
      <div className="ml-browse-main">
        <FilterBar
          filters={filters}
          locations={locations}
          onChange={handleFilterChange}
          onReset={() => handleFilterChange(EMPTY_FILTERS)}
        />

        <div className="ml-browse-meta">
          {isLoading ? (
            <span className="ml-loading">Loading…</span>
          ) : isError ? (
            <span className="ml-error">Failed to load media sets</span>
          ) : (
            <span className="ml-count">{totalDocs} media sets</span>
          )}
        </div>

        {!isLoading && !isError && (
          <div className="ml-grid">
            {mediaSets.length === 0 ? (
              <div className="ml-empty">No media sets found</div>
            ) : (
              mediaSets.map((ms) => (
                <MediaSetCard
                  key={ms.id}
                  mediaSet={ms}
                  health={computeHealth(ms)}
                  selected={selected?.id === ms.id}
                  onClick={() => setSelected(selected?.id === ms.id ? null : ms)}
                />
              ))
            )}
          </div>
        )}

        {totalPages > 1 && (
          <div className="ml-pagination">
            <button
              type="button"
              className="ml-page-btn"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              ← Prev
            </button>
            <span className="ml-page-info">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              className="ml-page-btn"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {selected && (
        <MediaSetSidePanel
          mediaSet={selected}
          health={computeHealth(selected)}
          token={token}
          onSave={handleSave}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

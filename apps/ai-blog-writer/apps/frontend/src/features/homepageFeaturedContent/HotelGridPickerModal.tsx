import { useEffect } from 'react'
import type { useQuery } from '@tanstack/react-query'

import type {
  HomepageHotelGridCandidate,
  HomepageHotelGridCandidatesResponse,
} from './hotelGridTypes'

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

export function HotelGridPickerModal({
  slotIndex,
  candidatesQuery,
  searchValue,
  candidatePage,
  usedIds,
  currentSlotId,
  onPick,
  onClose,
  setSearchValue,
  setCandidatePage,
}: {
  slotIndex: number
  candidatesQuery: ReturnType<typeof useQuery<HomepageHotelGridCandidatesResponse>>
  searchValue: string
  candidatePage: number
  usedIds: Set<number>
  currentSlotId: number | null
  onPick: (candidate: HomepageHotelGridCandidate) => void
  onClose: () => void
  setSearchValue: (v: string) => void
  setCandidatePage: (v: number | ((prev: number) => number)) => void
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const candidateError = candidatesQuery.error instanceof Error ? candidatesQuery.error.message : null
  const totalPages = candidatesQuery.data?.totalPages ?? 1

  return (
    <div className="hf-modal-backdrop" onClick={onClose}>
      <div
        className="hf-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Pick hotel for Slot ${slotIndex + 1}`}
      >
        <div className="hf-modal-top">
          <div className="hf-modal-title-row">
            <h2>Slot {slotIndex + 1} - Pick a hotel</h2>
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
              placeholder="Search hotel name or slug..."
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="hf-modal-body">
          {candidateError ? (
            <p className="hf-modal-empty">{candidateError}</p>
          ) : candidatesQuery.isLoading && !candidatesQuery.data ? (
            <p className="hf-modal-empty">Loading hotels...</p>
          ) : candidatesQuery.data && candidatesQuery.data.docs.length > 0 ? (
            candidatesQuery.data.docs.map((candidate) => {
              const isCurrentSlot = candidate.id === currentSlotId
              const isUsedElsewhere = usedIds.has(candidate.id) && !isCurrentSlot

              return (
                <div
                  key={candidate.id}
                  className={`hf-location-picker-row${isUsedElsewhere ? ' used' : ''}`}
                >
                  <div className="hf-location-picker-body">
                    <p className="hf-location-picker-title">{candidate.title}</p>
                    <div className="hf-location-picker-meta">
                      <span className="hf-level-tag">{candidate.type ?? 'hotel'}</span>
                      <span className="hf-location-picker-key">{candidate.location ?? candidate.slug ?? 'No location'}</span>
                      <span className="hf-location-picker-date">{formatDate(candidate.updatedAt)}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="hf-btn-primary"
                    onClick={() => onPick(candidate)}
                    disabled={isUsedElsewhere}
                    style={{ fontSize: '0.82rem', padding: '0.4rem 0.9rem', minHeight: '2rem', flexShrink: 0 }}
                  >
                    {isCurrentSlot ? 'Keep' : isUsedElsewhere ? 'In use' : 'Pick'}
                  </button>
                </div>
              )
            })
          ) : (
            <p className="hf-modal-empty">No hotels matched your search.</p>
          )}
        </div>

        {(candidatesQuery.data?.totalPages ?? 0) > 1 && (
          <div className="hf-modal-footer">
            <button
              type="button"
              className="hf-btn-ghost"
              onClick={() => setCandidatePage((page) => Math.max(1, page - 1))}
              disabled={candidatePage <= 1}
            >
              ← Prev
            </button>
            <span className="hf-pagination-label">
              {candidatesQuery.data?.page} / {totalPages}
            </span>
            <button
              type="button"
              className="hf-btn-ghost"
              onClick={() => setCandidatePage((page) => Math.min(totalPages, page + 1))}
              disabled={candidatePage >= totalPages}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect } from 'react'
import type { useQuery } from '@tanstack/react-query'

import type {
  HomepageHotelGridCandidate,
  HomepageHotelGridCandidatesResponse
} from './hotelGridTypes'

function formatDate(value: string | null): string {
  if (!value) return '—'
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return value
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
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
  itemLabel = 'hotel'
}: {
  slotIndex: number
  candidatesQuery: ReturnType<
    typeof useQuery<HomepageHotelGridCandidatesResponse>
  >
  searchValue: string
  candidatePage: number
  usedIds: Set<number>
  currentSlotId: number | null
  onPick: (candidate: HomepageHotelGridCandidate) => void
  onClose: () => void
  setSearchValue: (v: string) => void
  setCandidatePage: (v: number | ((prev: number) => number)) => void
  itemLabel?: string
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const candidateError =
    candidatesQuery.error instanceof Error
      ? candidatesQuery.error.message
      : null
  const totalPages = candidatesQuery.data?.totalPages ?? 1
  const isFetchingHotels = candidatesQuery.isFetching
  const showInitialLoad = candidatesQuery.isPending && !candidatesQuery.data
  const showUpdatingBanner = isFetchingHotels && Boolean(candidatesQuery.data)

  return (
    <div
      className="hf-modal-backdrop"
      onClick={() => {
        // Keep the dialog open while a request is in flight so a slow list load is not dismissed accidentally.
        if (!isFetchingHotels) onClose()
      }}
    >
      <div
        className="hf-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Pick ${itemLabel} for Slot ${slotIndex + 1}`}
      >
        <div className="hf-modal-top">
          <div className="hf-modal-title-row">
            <h2>
              Slot {slotIndex + 1} - Pick a {itemLabel}
            </h2>
          </div>

          <div className="hf-modal-search">
            <span className="hf-modal-search-icon">⌕</span>
            <input
              type="search"
              placeholder={`Search ${itemLabel} name…`}
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              autoFocus
            />
          </div>
          {showUpdatingBanner ? (
            <p
              className="hf-modal-empty"
              style={{ margin: '0.35rem 0 0', fontSize: '0.82rem' }}
              role="status"
            >
              Updating list…
            </p>
          ) : null}
        </div>

        <div className="hf-modal-body">
          {candidateError ? (
            <p className="hf-modal-empty">{candidateError}</p>
          ) : showInitialLoad ? (
            <p className="hf-modal-empty">Loading {itemLabel}s…</p>
          ) : candidatesQuery.data && candidatesQuery.data.docs.length > 0 ? (
            candidatesQuery.data.docs.map((candidate) => {
              const isCurrentSlot = candidate.id === currentSlotId
              const isUsedElsewhere =
                usedIds.has(candidate.id) && !isCurrentSlot
              const thumbSrc =
                typeof candidate.imageUrl === 'string' &&
                candidate.imageUrl.trim()
                  ? candidate.imageUrl.trim()
                  : null
              const hasUsableImage = Boolean(thumbSrc)

              return (
                <div
                  key={candidate.id}
                  className={`hf-location-picker-row${isUsedElsewhere ? ' used' : ''}`}
                >
                  <div className="hf-location-picker-thumb">
                    {thumbSrc ? (
                      <img
                        src={thumbSrc}
                        alt={candidate.title}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : null}
                  </div>
                  <div className="hf-location-picker-body">
                    <p className="hf-location-picker-title">
                      {candidate.title}
                    </p>
                    <div className="hf-location-picker-meta">
                      <span className="hf-level-tag">
                        {candidate.type ?? 'hotel'}
                      </span>
                      <span className="hf-location-picker-key">
                        {candidate.location ?? candidate.slug ?? 'No location'}
                      </span>
                      <span className="hf-location-picker-date">
                        {formatDate(candidate.updatedAt)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className={
                      isCurrentSlot || !hasUsableImage
                        ? 'hf-btn-ghost'
                        : 'hf-btn-primary'
                    }
                    onClick={() => onPick(candidate)}
                    disabled={
                      isCurrentSlot || isUsedElsewhere || !hasUsableImage
                    }
                    title={
                      hasUsableImage
                        ? undefined
                        : `Add a gallery card image before featuring this ${itemLabel}.`
                    }
                    style={{
                      fontSize: '0.82rem',
                      padding: '0.4rem 0.9rem',
                      minHeight: '2rem',
                      flexShrink: 0
                    }}
                  >
                    {!hasUsableImage
                      ? 'Needs image'
                      : isCurrentSlot
                        ? 'Current'
                        : isUsedElsewhere
                          ? 'In use'
                          : 'Pick'}
                  </button>
                </div>
              )
            })
          ) : (
            <p className="hf-modal-empty">
              No {itemLabel}s matched your search.
            </p>
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
              onClick={() =>
                setCandidatePage((page) => Math.min(totalPages, page + 1))
              }
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

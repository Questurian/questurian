import { useEffect } from 'react'

import type {
  HomepageFeaturedCandidate,
  HomepageFeaturedCandidatesResponse,
  HomepageFeaturedCollection,
} from './types'
import type { useQuery } from '@tanstack/react-query'

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

function ImgPlaceholder() {
  return (
    <svg
      style={{ width: '100%', height: '100%', color: 'var(--muted)' }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )
}

type Props = {
  slotIndex: number
  candidatesQuery: ReturnType<typeof useQuery<HomepageFeaturedCandidatesResponse>>
  searchValue: string
  collectionFilter: HomepageFeaturedCollection | 'all'
  candidatePage: number
  usedKeys: Set<string>
  currentSlotKey: string | null
  onPick: (candidate: HomepageFeaturedCandidate) => void
  onClose: () => void
  setSearchValue: (v: string) => void
  setCollectionFilter: (v: HomepageFeaturedCollection | 'all') => void
  setCandidatePage: (v: number | ((prev: number) => number)) => void
}

export function ArticlePickerModal({
  slotIndex,
  candidatesQuery,
  searchValue,
  collectionFilter,
  candidatePage,
  usedKeys,
  currentSlotKey,
  onPick,
  onClose,
  setSearchValue,
  setCollectionFilter,
  setCandidatePage,
}: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
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
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Pick article for Slot ${slotIndex + 1}`}
      >
        {/* ── Header ─────────────────────────────────────── */}
        <div className="hf-modal-top">
          <div className="hf-modal-title-row">
            <h2>Slot {slotIndex + 1} — Pick an article</h2>
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
              placeholder="Search title or slug…"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
            <select
              value={collectionFilter}
              onChange={(e) => setCollectionFilter(e.target.value as typeof collectionFilter)}
              style={{ marginLeft: 'auto', flexShrink: 0 }}
            >
              <option value="all">All types</option>
              <option value="articles">Articles</option>
              <option value="single-type-listicles">Listicles</option>
              <option value="listicle-itineraries">Itineraries</option>
            </select>
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────── */}
        <div className="hf-modal-body">
          {candidateError ? (
            <p className="hf-modal-empty">{candidateError}</p>
          ) : candidatesQuery.isLoading && !candidatesQuery.data ? (
            <p className="hf-modal-empty">Loading articles…</p>
          ) : candidatesQuery.data && candidatesQuery.data.docs.length > 0 ? (
            candidatesQuery.data.docs.map((candidate) => {
              const key = `${candidate.relationTo}:${candidate.id}`
              const isCurrentSlot = key === currentSlotKey
              const isUsedElsewhere = usedKeys.has(key) && !isCurrentSlot

              return (
                <div
                  key={key}
                  className={`hf-picker-row${isUsedElsewhere ? ' used' : ''}`}
                >
                  <div className="hf-picker-thumb">
                    {candidate.imageUrl ? (
                      <img src={candidate.imageUrl} alt="" loading="lazy" />
                    ) : (
                      <ImgPlaceholder />
                    )}
                  </div>

                  <div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', lineHeight: 1.3 }}>
                      {candidate.title}
                    </p>
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
                      <span className="hf-level-tag">{candidate.collectionLabel}</span>
                      <span className="hf-level-tag">{candidate.status ?? 'unknown'}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                        {formatDate(candidate.updatedAt)}
                      </span>
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
            <p className="hf-modal-empty">No articles matched your search.</p>
          )}
        </div>

        {/* ── Footer pagination ───────────────────────────── */}
        {(candidatesQuery.data?.totalPages ?? 0) > 1 && (
          <div className="hf-modal-footer">
            <button
              type="button"
              className="hf-btn-ghost"
              onClick={() => setCandidatePage((p) => Math.max(1, p - 1))}
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
              onClick={() => setCandidatePage((p) => Math.min(totalPages, p + 1))}
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

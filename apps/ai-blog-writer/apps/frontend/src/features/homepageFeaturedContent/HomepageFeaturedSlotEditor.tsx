import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import type { UseHomepageFeaturedSlotsResult } from './useHomepageFeaturedSlots'
import type { HomepageFeaturedCandidate, HomepageFeaturedInvalidItem } from './types'

function formatDate(value: string | null): string {
  if (!value) return 'Unknown'
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return value
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getInvalidMessage(item: HomepageFeaturedInvalidItem): string {
  if (item.reason === 'not_published') return 'This item is no longer published.'
  if (item.reason === 'not_found') return 'This item could not be found.'
  return 'Invalid reference in saved data.'
}

function ImgPlaceholder({ className }: { className: string }) {
  return (
    <svg
      className={className}
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
  pageTitle: string
  pageSubtitle?: string
  slotEditorState: UseHomepageFeaturedSlotsResult
  headerActions?: ReactNode
  /** When true, renders only the editor grid without the page wrapper or hero. */
  compact?: boolean
}

export default function HomepageFeaturedSlotEditor({
  pageTitle,
  pageSubtitle,
  slotEditorState,
  headerActions,
  compact = false,
}: Props) {
  const {
    selectionQuery,
    candidatesQuery,
    saveMutation,
    slots,
    savedInvalidItems,
    replaceSlotIndex,
    firstEmptySlotIndex,
    usedKeys,
    hasAllSlotsFilled,
    hasUnsavedChanges,
    saveDisabled,
    invalidItemsBySlot,
    resultMessage,
    searchValue,
    collectionFilter,
    candidatePage,
    handleCandidatePick,
    handleMove,
    handleRemove,
    handleReset,
    handleSave,
    setSearchValue,
    setCollectionFilter,
    setCandidatePage,
    setReplaceSlotIndex,
    draftSlots,
  } = slotEditorState

  const loadError = selectionQuery.error instanceof Error ? selectionQuery.error.message : null
  const candidateError = candidatesQuery.error instanceof Error ? candidatesQuery.error.message : null

  if (selectionQuery.isLoading && draftSlots === null) {
    const screen = (
      <div className="hf-state-screen">
        <h2>Loading…</h2>
        <p>Fetching saved slot order from Payload.</p>
      </div>
    )
    return compact ? screen : <div className="hf-page">{screen}</div>
  }

  if (loadError && draftSlots === null) {
    const screen = (
      <div className="hf-state-screen">
        <h2>{pageTitle}</h2>
        <p>{loadError}</p>
      </div>
    )
    return compact ? screen : <div className="hf-page">{screen}</div>
  }

  const isComplete = selectionQuery.data?.isComplete

  const mainContent = (
    <>
      {savedInvalidItems.length > 0 && (
        <div className="hf-banner warning">
          {savedInvalidItems.length === 1
            ? 'One saved slot is no longer eligible. Replace it before saving again.'
            : `${savedInvalidItems.length} saved slots are no longer eligible. Replace them before saving.`}
        </div>
      )}

      {resultMessage && (
        <div className={`hf-banner ${saveMutation.isError ? 'error' : 'success'}`}>
          {resultMessage}
        </div>
      )}

      <div className="hf-editor-grid">
        {/* ── Slots panel ────────────────────────────────────── */}
        <section className="hf-panel">
          <div className="hf-panel-header">
            <div>
              <h2 className="hf-panel-title">{selectionQuery.data?.totalSlots ?? slots.length} Featured Slots</h2>
              <p className="hf-panel-desc">
                Fixed positions displayed on the front page. Use Replace to target a specific slot
                directly.
              </p>
            </div>
            <div className="hf-panel-actions">
              <button
                type="button"
                className="hf-btn-ghost"
                onClick={handleReset}
                disabled={!hasUnsavedChanges}
              >
                Discard
              </button>
              <button
                type="button"
                className="hf-btn-primary"
                onClick={handleSave}
                disabled={saveDisabled}
              >
                {saveMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>

          <div className="hf-slot-list">
            {slots.map((item, slotIndex) => {
              const invalidItem = invalidItemsBySlot.get(slotIndex + 1)
              const isReplacing = replaceSlotIndex === slotIndex

              return (
                <article
                  key={`slot-${slotIndex + 1}`}
                  className={[
                    'hf-slot',
                    isReplacing ? 'replacing' : '',
                    !item ? 'empty' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="hf-slot-num">{slotIndex + 1}</span>

                  <div className="hf-slot-thumb">
                    {item?.imageUrl ? (
                      <img src={item.imageUrl} alt="" loading="lazy" />
                    ) : (
                      <ImgPlaceholder className="hf-slot-thumb-placeholder" />
                    )}
                  </div>

                  <div className="hf-slot-body">
                    {item ? (
                      <>
                        <div className="hf-slot-meta">
                          <span className="hf-slot-meta-tag">
                            {(item as HomepageFeaturedCandidate).collectionLabel}
                          </span>
                          <span className="hf-slot-meta-tag">{item.status ?? 'unknown'}</span>
                          <span className="hf-slot-meta-tag">
                            Updated {formatDate(item.updatedAt)}
                          </span>
                        </div>
                        <p className="hf-slot-title">{item.title}</p>
                        <p className="hf-slot-sub">
                          {item.slug ? `/${item.slug}` : 'No slug'} · #{item.id}
                        </p>
                      </>
                    ) : (
                      <>
                        <span className="hf-slot-empty-label">Empty slot</span>
                        <p className="hf-slot-empty-hint">
                          {invalidItem
                            ? getInvalidMessage(invalidItem)
                            : 'Pick a candidate from the right panel.'}
                        </p>
                        {invalidItem && (
                          <span className="hf-slot-empty-warn">
                            Needs replacement before saving.
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  <div className="hf-slot-actions">
                    <button
                      type="button"
                      className="hf-btn-ghost"
                      onClick={() => setReplaceSlotIndex(isReplacing ? null : slotIndex)}
                      style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem', minHeight: '1.9rem' }}
                    >
                      {isReplacing ? '↩ Cancel' : 'Replace'}
                    </button>
                    <button
                      type="button"
                      className="hf-btn-icon"
                      title="Move up"
                      onClick={() => handleMove(slotIndex, -1)}
                      disabled={slotIndex === 0}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="hf-btn-icon"
                      title="Move down"
                      onClick={() => handleMove(slotIndex, 1)}
                      disabled={slotIndex === slots.length - 1}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="hf-btn-icon danger"
                      title="Remove"
                      onClick={() => handleRemove(slotIndex)}
                      disabled={!item && !invalidItem}
                    >
                      ×
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        {/* ── Candidates panel ───────────────────────────────── */}
        <section className="hf-panel">
          <div className="hf-panel-header">
            <div>
              <h2 className="hf-panel-title">Content Library</h2>
              <p className="hf-panel-desc">
                Search Payload content and add articles directly into the selection.
              </p>
            </div>
          </div>

          <div className="hf-search-row">
            <input
              type="search"
              className="hf-search-input"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search title or slug…"
            />
            <select
              className="hf-type-select"
              value={collectionFilter}
              onChange={(e) => setCollectionFilter(e.target.value as typeof collectionFilter)}
            >
              <option value="all">All types</option>
              <option value="articles">Articles</option>
              <option value="single-type-listicles">Listicles</option>
              <option value="listicle-itineraries">Itineraries</option>
            </select>
          </div>

          {replaceSlotIndex !== null && (
            <div className="hf-replace-note">
              Replace mode active for slot {replaceSlotIndex + 1} — click a card to swap.
            </div>
          )}

          {candidateError ? (
            <div className="hf-empty">
              <p>{candidateError}</p>
            </div>
          ) : candidatesQuery.isLoading && !candidatesQuery.data ? (
            <div className="hf-empty">
              <p>Loading candidates…</p>
            </div>
          ) : candidatesQuery.data && candidatesQuery.data.docs.length > 0 ? (
            <>
              <div className="hf-candidate-list">
                {candidatesQuery.data.docs.map((candidate) => {
                  const candidateKey = `${candidate.relationTo}:${candidate.id}`
                  const isUsed = usedKeys.has(candidateKey)
                  const isCurrentSlot =
                    replaceSlotIndex !== null &&
                    slots[replaceSlotIndex]?.id === candidate.id &&
                    slots[replaceSlotIndex]?.relationTo === candidate.relationTo
                  const isDisabled = isUsed && !isCurrentSlot
                  const isFull = replaceSlotIndex === null && firstEmptySlotIndex === -1
                  const actionLabel =
                    isDisabled
                      ? 'In use'
                      : replaceSlotIndex !== null
                        ? `→ Slot ${replaceSlotIndex + 1}`
                        : firstEmptySlotIndex >= 0
                          ? `→ Slot ${firstEmptySlotIndex + 1}`
                          : 'Full'

                  return (
                    <article
                      key={candidateKey}
                      className={`hf-candidate${isUsed && !isCurrentSlot ? ' used' : ''}`}
                    >
                      <div className="hf-candidate-thumb">
                        {candidate.imageUrl ? (
                          <img src={candidate.imageUrl} alt="" loading="lazy" />
                        ) : (
                          <ImgPlaceholder className="hf-slot-thumb-placeholder" />
                        )}
                      </div>

                      <div className="hf-candidate-body">
                        <p className="hf-candidate-title">{candidate.title}</p>
                        <div className="hf-candidate-meta">
                          <span className="hf-candidate-meta-tag">
                            {candidate.collectionLabel}
                          </span>
                          <span className="hf-candidate-meta-tag">
                            {candidate.status ?? 'unknown'}
                          </span>
                          <span className="hf-candidate-meta-tag">
                            {formatDate(candidate.updatedAt)}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="hf-btn-primary"
                        style={{ fontSize: '0.82rem', padding: '0.4rem 0.7rem', minHeight: '2rem' }}
                        onClick={() => handleCandidatePick(candidate)}
                        disabled={isDisabled || isFull}
                      >
                        {actionLabel}
                      </button>
                    </article>
                  )
                })}
              </div>

              <div className="hf-pagination">
                <button
                  type="button"
                  className="hf-btn-ghost"
                  onClick={() => setCandidatePage((p) => Math.max(1, p - 1))}
                  disabled={candidatePage <= 1}
                >
                  ← Prev
                </button>
                <span className="hf-pagination-label">
                  {candidatesQuery.data.page} / {candidatesQuery.data.totalPages}
                </span>
                <button
                  type="button"
                  className="hf-btn-ghost"
                  onClick={() =>
                    setCandidatePage((p) =>
                      Math.min(candidatesQuery.data?.totalPages || p, p + 1),
                    )
                  }
                  disabled={candidatePage >= (candidatesQuery.data.totalPages || 1)}
                >
                  Next →
                </button>
              </div>
            </>
          ) : (
            <div className="hf-empty">
              <p>No candidates matched the current filters.</p>
            </div>
          )}
        </section>
      </div>
    </>
  )

  if (compact) {
    return mainContent
  }

  return (
    <div className="hf-page">
      <header className="hf-hero">
        <div className="hf-hero-copy">
          <p className="hf-kicker">Structured Publishing</p>
          <h1>{pageTitle}</h1>
          <p className="hf-hero-desc">
            {pageSubtitle ??
              `Curate the exact ${selectionQuery.data?.totalSlots ?? slots.length} content slots. Add, replace, reorder, and save only when every slot is filled with a unique entry.`}
          </p>
        </div>
        <div className="hf-hero-badges">
          {headerActions}
          {selectionQuery.data && (
            <span className={`hf-badge ${isComplete ? 'success' : 'warning'}`}>
              {isComplete ? 'Selection complete' : 'Needs attention'}
            </span>
          )}
          <span className={`hf-badge ${hasAllSlotsFilled ? 'success' : 'warning'}`}>
            {slots.filter(Boolean).length} / {selectionQuery.data?.totalSlots ?? slots.length} slots
          </span>
          <span className={`hf-badge ${hasUnsavedChanges ? 'warning' : 'muted'}`}>
            {hasUnsavedChanges ? 'Unsaved changes' : 'Saved'}
          </span>
          {selectionQuery.data && (
            <span className="hf-badge muted">
              Drafts {selectionQuery.data.allowDrafts ? 'allowed' : 'blocked'}
            </span>
          )}
        </div>
      </header>

      {mainContent}

      <div className="hf-banner">
        Need more content?{' '}
        <Link to="/single-type-listicles">Single Type Listicles</Link>,{' '}
        <Link to="/listicle-itineraries">Listicle Itineraries</Link>, or the standard article
        staging flow, then come back here to feature it.
      </div>
    </div>
  )
}

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import type { UseHomepageFeaturedSlotsResult } from './useHomepageFeaturedSlots'
import type { HomepageFeaturedInvalidItem } from './types'
import { ArticlePickerModal } from './ArticlePickerModal'
import ArticleGridLayout from './ArticleGridLayout'
import FeaturedArticleSpotlightLayout from './FeaturedArticleSpotlightLayout'
import FeaturedArticlesLayout3 from './FeaturedArticlesLayout3'
import FeaturedArticlesLayout4 from './FeaturedArticlesLayout4'
import FeaturedArticlesLayout8 from './FeaturedArticlesLayout8'
import FeaturedArticlesLayout9 from './FeaturedArticlesLayout9'
import type { ArticleCuratedHomepageBlockType } from './pageBlocks'

function getInvalidMessage(item: HomepageFeaturedInvalidItem): string {
  if (item.reason === 'not_published') return 'No longer published'
  if (item.reason === 'not_found') return 'Item not found'
  return 'Invalid reference'
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
  pageTitle: string
  pageSubtitle?: string
  slotEditorState: UseHomepageFeaturedSlotsResult
  headerActions?: ReactNode
  /** When true, renders only the editor grid without the page wrapper or hero. */
  compact?: boolean
  variant?: ArticleCuratedHomepageBlockType
}

export default function HomepageFeaturedSlotEditor({
  pageTitle,
  pageSubtitle,
  slotEditorState,
  headerActions,
  compact = false,
  variant = 'featured-articles',
}: Props) {
  const {
    selectionQuery,
    candidatesQuery,
    saveMutation,
    slots,
    savedInvalidItems,
    pickerSlotIndex,
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
    setPickerSlotIndex,
    draftSlots,
  } = slotEditorState

  const loadError = selectionQuery.error instanceof Error ? selectionQuery.error.message : null
  const isComplete = selectionQuery.data?.isComplete

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

  const currentSlotItem = pickerSlotIndex !== null ? slots[pickerSlotIndex] : null
  const currentSlotKey = currentSlotItem
    ? `${currentSlotItem.relationTo}:${currentSlotItem.id}`
    : null
  const totalSlots = selectionQuery.data?.totalSlots ?? slots.length

  const mainContent = (
    <>
      {savedInvalidItems.length > 0 && (
        <div className="hf-banner warning">
          {savedInvalidItems.length === 1
            ? 'One saved slot is no longer eligible. Swap it before saving again.'
            : `${savedInvalidItems.length} saved slots are no longer eligible. Swap them before saving.`}
        </div>
      )}

      {resultMessage && (
        <div className={`hf-banner ${saveMutation.isError ? 'error' : 'success'}`}>
          {resultMessage}
        </div>
      )}

      {/* ── Controls row ───────────────────────────────────── */}
      <div className="hf-slot-controls">
        <span className="hf-panel-desc">
          {slots.filter(Boolean).length} / {selectionQuery.data?.totalSlots ?? slots.length} slots filled
        </span>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
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

      {/* ── Slot grid / Layout ─────────────────────────────── */}
      {variant === 'featured-article' ? (
        <FeaturedArticleSpotlightLayout
          item={slots[0] ?? null}
          invalidItem={invalidItemsBySlot.get(1)}
          onPick={() => setPickerSlotIndex(0)}
          onRemove={() => handleRemove(0)}
        />
      ) : variant === 'article-grid' ? (
        <ArticleGridLayout
          slots={slots}
          invalidItemsBySlot={invalidItemsBySlot}
          onSlotClick={setPickerSlotIndex}
          onMove={handleMove}
          onRemove={handleRemove}
        />
      ) : totalSlots === 9 ? (
        <FeaturedArticlesLayout9
          slots={slots}
          invalidItemsBySlot={invalidItemsBySlot}
          onSlotClick={setPickerSlotIndex}
        />
      ) : totalSlots === 8 ? (
        <FeaturedArticlesLayout8
          slots={slots}
          invalidItemsBySlot={invalidItemsBySlot}
          onSlotClick={setPickerSlotIndex}
        />
      ) : totalSlots === 4 ? (
        <FeaturedArticlesLayout4
          slots={slots}
          invalidItemsBySlot={invalidItemsBySlot}
          onSlotClick={setPickerSlotIndex}
        />
      ) : totalSlots === 3 ? (
        <FeaturedArticlesLayout3
          slots={slots}
          invalidItemsBySlot={invalidItemsBySlot}
          onSlotClick={setPickerSlotIndex}
        />
      ) : (
      <div className="hf-slot-grid">
        {slots.map((item, slotIndex) => {
          const invalidItem = invalidItemsBySlot.get(slotIndex + 1)

          if (!item) {
            // Empty or invalid slot — clickable card
            return (
              <button
                key={`slot-${slotIndex + 1}`}
                type="button"
                className={`hf-slot-card empty${invalidItem ? ' invalid' : ''}`}
                onClick={() => setPickerSlotIndex(slotIndex)}
              >
                <span className="hf-slot-card-num">{slotIndex + 1}</span>
                {invalidItem ? (
                  <>
                    <span style={{ fontSize: '1.4rem' }}>⚠</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--danger)', fontWeight: 600 }}>
                      {getInvalidMessage(invalidItem)}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                      Click to replace
                    </span>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: '1.6rem', color: 'var(--muted)' }}>＋</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Add article</span>
                  </>
                )}
              </button>
            )
          }

          // Filled slot card
          return (
            <article
              key={`slot-${slotIndex + 1}`}
              className="hf-slot-card"
            >
              <div className="hf-slot-card-thumb">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" loading="lazy" />
                ) : (
                  <ImgPlaceholder />
                )}
                <span className="hf-slot-card-num">{slotIndex + 1}</span>
              </div>

              <div className="hf-slot-card-body">
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                  <span className="hf-level-tag">{item.collectionLabel}</span>
                  <span className="hf-level-tag">{item.status ?? 'unknown'}</span>
                </div>
                <p className="hf-slot-card-title">{item.title}</p>

                <div className="hf-slot-card-actions">
                  <button
                    type="button"
                    className="hf-btn-ghost"
                    onClick={() => setPickerSlotIndex(slotIndex)}
                    style={{ fontSize: '0.78rem', padding: '0.25rem 0.6rem', minHeight: '1.8rem' }}
                  >
                    Swap
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
                  >
                    ×
                  </button>
                </div>
              </div>
            </article>
          )
        })}
      </div>
      )}

      {/* ── Picker modal ───────────────────────────────────── */}
      {pickerSlotIndex !== null && (
        <ArticlePickerModal
          slotIndex={pickerSlotIndex}
          candidatesQuery={candidatesQuery}
          searchValue={searchValue}
          collectionFilter={collectionFilter}
          candidatePage={candidatePage}
          usedKeys={usedKeys}
          currentSlotKey={currentSlotKey}
          onPick={handleCandidatePick}
          onClose={() => setPickerSlotIndex(null)}
          setSearchValue={setSearchValue}
          setCollectionFilter={setCollectionFilter}
          setCandidatePage={setCandidatePage}
        />
      )}
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
              `Curate ${totalSlots} article slots. Click any slot to pick or swap its article, then save.`}
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
            {slots.filter(Boolean).length} / {totalSlots} slots
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

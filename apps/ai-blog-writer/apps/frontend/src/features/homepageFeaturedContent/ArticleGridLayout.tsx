import type { MouseEvent } from 'react'

import type { ArticleGridFourLayout } from './pageBlocks'
import type { HomepageFeaturedInvalidItem } from './types'
import type { SlotValue } from './useHomepageFeaturedSlots'

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
  slots: SlotValue[]
  /** When there are 4 slots: wide strip vs 2×2 square (ignored for 8 slots). */
  articleGridFourLayout?: ArticleGridFourLayout
  invalidItemsBySlot: Map<number, HomepageFeaturedInvalidItem>
  onSlotClick: (slotIndex: number) => void
  onMove: (slotIndex: number, direction: -1 | 1) => void
  onRemove: (slotIndex: number) => void
}

export default function ArticleGridLayout({
  slots,
  articleGridFourLayout = 'four-across',
  invalidItemsBySlot,
  onSlotClick,
  onMove,
  onRemove,
}: Props) {
  const fourVariant =
    articleGridFourLayout === 'two-by-two'
      ? 'hf-article-grid--4-2x2'
      : 'hf-article-grid--4-across'
  const gridVariant =
    slots.length === 8
      ? 'hf-article-grid--slots-8'
      : `hf-article-grid--slots-4 ${fourVariant}`

  function stopEvent(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
  }

  return (
    <div className={`hf-article-grid ${gridVariant}`}>
      {slots.map((item, slotIndex) => {
        const invalidItem = invalidItemsBySlot.get(slotIndex + 1)

        if (!item) {
          return (
            <button
              key={`slot-${slotIndex + 1}`}
              type="button"
              className={`hf-article-grid-card empty${invalidItem ? ' invalid' : ''}`}
              onClick={() => onSlotClick(slotIndex)}
            >
              <span className="hf-slot-card-num">{slotIndex + 1}</span>
              {invalidItem ? (
                <>
                  <span style={{ fontSize: '1.4rem' }}>⚠</span>
                  <span className="hf-article-grid-empty-label">
                    {getInvalidMessage(invalidItem)}
                  </span>
                  <span className="hf-article-grid-empty-hint">Click to replace</span>
                </>
              ) : (
                <>
                  <span style={{ fontSize: '1.7rem', color: 'var(--muted)' }}>＋</span>
                  <span className="hf-article-grid-empty-label">Add article</span>
                </>
              )}
            </button>
          )
        }

        return (
          <article key={`slot-${slotIndex + 1}`} className="hf-article-grid-card">
            <div className="hf-article-grid-thumb">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt="" loading="lazy" />
              ) : (
                <ImgPlaceholder />
              )}
              <span className="hf-slot-card-num">{slotIndex + 1}</span>
            </div>
            <div className="hf-article-grid-body">
              <div className="hf-article-grid-meta">
                <span className="hf-level-tag">{item.collectionLabel}</span>
                <span className="hf-level-tag">{item.status ?? 'unknown'}</span>
              </div>
              <p className="hf-article-grid-title">{item.title}</p>
              <div className="hf-article-grid-actions">
                <button
                  type="button"
                  className="hf-btn-ghost"
                  onClick={() => onSlotClick(slotIndex)}
                  style={{ fontSize: '0.78rem', padding: '0.25rem 0.6rem', minHeight: '1.8rem' }}
                >
                  Swap
                </button>
                <button
                  type="button"
                  className="hf-btn-icon"
                  title="Move up"
                  onClick={(event) => {
                    stopEvent(event)
                    onMove(slotIndex, -1)
                  }}
                  disabled={slotIndex === 0}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="hf-btn-icon"
                  title="Move down"
                  onClick={(event) => {
                    stopEvent(event)
                    onMove(slotIndex, 1)
                  }}
                  disabled={slotIndex === slots.length - 1}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="hf-btn-icon danger"
                  title="Remove"
                  onClick={(event) => {
                    stopEvent(event)
                    onRemove(slotIndex)
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

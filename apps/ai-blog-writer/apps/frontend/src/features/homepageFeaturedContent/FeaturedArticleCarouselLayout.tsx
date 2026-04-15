import { useState } from 'react'
import type { HomepageFeaturedInvalidItem } from './types'
import type { SlotValue } from './useHomepageFeaturedSlots'

function ImgPlaceholder() {
  return (
    <div className="hf-fa-spotlight-placeholder-inner" aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
        <rect x="3" y="5" width="18" height="14" rx="1" />
        <circle cx="8.5" cy="10" r="1.5" />
        <path d="M21 17l-6-5-4 4-3-3L3 17" />
      </svg>
    </div>
  )
}

function invalidMessage(item: HomepageFeaturedInvalidItem): string {
  if (item.reason === 'not_published') return 'No longer published'
  if (item.reason === 'not_found') return 'Item not found'
  return 'Invalid reference'
}

type Props = {
  slots: SlotValue[]
  invalidItemsBySlot: Map<number, HomepageFeaturedInvalidItem>
  onSlotClick: (slotIndex: number) => void
  onRemove: (slotIndex: number) => void
}

export default function FeaturedArticleCarouselLayout({
  slots,
  invalidItemsBySlot,
  onSlotClick,
  onRemove,
}: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const total = slots.length
  const safeIndex = Math.min(activeIndex, total - 1)
  const item = slots[safeIndex] ?? null
  const invalidItem = invalidItemsBySlot.get(safeIndex + 1)

  function prev() {
    setActiveIndex((i) => (i === 0 ? total - 1 : i - 1))
  }

  function next() {
    setActiveIndex((i) => (i === total - 1 ? 0 : i + 1))
  }

  return (
    <div className="hf-fa-spotlight">
      <div className="hf-fa-spotlight-inner">
        {/* ── Copy / left side ── */}
        <div className="hf-fa-spotlight-copy">
          {!item || invalidItem ? (
            <button
              type="button"
              className="hf-fa-spotlight-empty"
              onClick={() => onSlotClick(safeIndex)}
            >
              <span className="hf-fa-spotlight-empty-title">
                {invalidItem ? invalidMessage(invalidItem) : `Slot ${safeIndex + 1} — choose article`}
              </span>
              <span className="hf-fa-spotlight-empty-hint">
                {invalidItem
                  ? 'Click to replace this slot.'
                  : 'Full-width hero. Use arrows to navigate all slots.'}
              </span>
            </button>
          ) : (
            <>
              <h2 className="hf-fa-spotlight-title">{item.title}</h2>
              {item.excerpt?.trim() ? (
                <p className="hf-fa-spotlight-dek">{item.excerpt.trim()}</p>
              ) : null}
              {item.authorLabel?.trim() ? (
                <p className="hf-fa-spotlight-byline">
                  BY {item.authorLabel.trim().toUpperCase()}
                </p>
              ) : null}
              <div className="hf-fa-spotlight-actions">
                <button
                  type="button"
                  className="hf-fa-spotlight-btn"
                  onClick={() => onSlotClick(safeIndex)}
                >
                  Swap article
                </button>
                <button
                  type="button"
                  className="hf-fa-spotlight-btn ghost"
                  onClick={() => onRemove(safeIndex)}
                >
                  Clear
                </button>
              </div>
            </>
          )}

          {/* ── Carousel nav arrows (bottom of copy, matching original design) ── */}
          <div className="hf-carousel-nav">
            <button
              type="button"
              className="hf-carousel-arrow"
              onClick={prev}
              aria-label="Previous slide"
            >
              ‹
            </button>
            <button
              type="button"
              className="hf-carousel-arrow"
              onClick={next}
              aria-label="Next slide"
            >
              ›
            </button>
            <span className="hf-carousel-counter">
              {safeIndex + 1} / {total}
            </span>
          </div>
        </div>

        {/* ── Image / right side ── */}
        <div className="hf-fa-spotlight-media" aria-hidden={!item?.imageUrl}>
          {item?.imageUrl ? (
            <img src={item.imageUrl} alt="" loading="lazy" />
          ) : (
            <ImgPlaceholder />
          )}
        </div>
      </div>

      {/* ── Slot indicator dots ── */}
      <div className="hf-carousel-dots">
        {slots.map((_, i) => {
          const slotInvalid = invalidItemsBySlot.has(i + 1)
          const filled = Boolean(slots[i])
          return (
            <button
              key={i}
              type="button"
              className={`hf-carousel-dot${i === safeIndex ? ' active' : ''}${slotInvalid ? ' invalid' : ''}${!filled ? ' empty' : ''}`}
              onClick={() => setActiveIndex(i)}
              aria-label={`Go to slot ${i + 1}`}
            />
          )
        })}
      </div>
    </div>
  )
}

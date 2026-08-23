import {
  CuratedSlotSwapProvider,
  CuratedSlotSwapWrap
} from './CuratedArticleSlotSwap'
import { useEffect, useRef, useState } from 'react'
import type { HomepageHotelGridInvalidItem } from './hotelGridTypes'
import type { HotelGridSlotValue } from './useHomepageHotelGridSlots'

function getInvalidMessage(item: HomepageHotelGridInvalidItem): string {
  if (item.reason === 'not_found') return 'Hotel not found'
  if (item.reason === 'not_published') return 'Not published'
  return 'Invalid hotel'
}

/** Avoid RangeError: String.repeat requires a finite integer (bad API data would white-screen the page). */
function formatPriceLevelDollars(
  priceLevel: string | null | undefined
): string | null {
  if (priceLevel == null || priceLevel === '') return null
  const n = parseInt(String(priceLevel), 10)
  if (!Number.isFinite(n) || n < 1) return null
  return '$'.repeat(Math.min(4, n))
}

function getPageOffsets(viewport: HTMLDivElement, pageCount: number): number[] {
  const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
  return Array.from({ length: pageCount }, (_, page) =>
    Math.min(page * viewport.clientWidth, maxScroll)
  )
}

export default function HotelGridLayout({
  slots,
  invalidItemsBySlot,
  onSlotClick,
  onReorder,
  onAppend,
  onRemove,
  maxItems,
  itemLabel = 'hotel'
}: {
  slots: HotelGridSlotValue[]
  invalidItemsBySlot: Map<number, HomepageHotelGridInvalidItem>
  onSlotClick: (slotIndex: number) => void
  onReorder: (newSlots: HotelGridSlotValue[]) => void
  onAppend?: () => void
  onRemove?: (slotIndex: number) => void
  maxItems?: number
  itemLabel?: string
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [activePage, setActivePage] = useState(0)
  const canAppend =
    Boolean(onAppend) &&
    slots.every(Boolean) &&
    slots.length < (maxItems ?? Infinity)
  const cardCount = slots.length + (canAppend ? 1 : 0)
  const pageCount = Math.max(1, Math.ceil(cardCount / 4))

  useEffect(() => {
    setActivePage((page) => Math.min(page, pageCount - 1))
  }, [pageCount])

  function scrollToPage(page: number) {
    const nextPage = Math.max(0, Math.min(pageCount - 1, page))
    const viewport = viewportRef.current
    if (!viewport) return
    const pageOffsets = getPageOffsets(viewport, pageCount)

    viewport.scrollTo({
      left: pageOffsets[nextPage],
      behavior: 'smooth'
    })
    setActivePage(nextPage)
  }

  return (
    <CuratedSlotSwapProvider slots={slots} onReorder={onReorder}>
      <section
        className="hf-location-carousel"
        aria-label={`${itemLabel} carousel`}
        aria-roledescription="carousel"
      >
        <div className="hf-location-carousel-toolbar">
          <span className="hf-location-carousel-status" aria-live="polite">
            {slots.length} cards · page {activePage + 1} of {pageCount}
          </span>
          <div className="hf-location-carousel-arrows">
            <button
              type="button"
              className="hf-location-carousel-arrow"
              onClick={() => scrollToPage(activePage - 1)}
              disabled={activePage === 0}
              aria-label={`Previous ${itemLabel}s`}
            >
              ‹
            </button>
            <button
              type="button"
              className="hf-location-carousel-arrow"
              onClick={() => scrollToPage(activePage + 1)}
              disabled={activePage >= pageCount - 1}
              aria-label={`Next ${itemLabel}s`}
            >
              ›
            </button>
          </div>
        </div>
        <div
          ref={viewportRef}
          className="hf-location-carousel-viewport"
          onScroll={(event) => {
            const viewport = event.currentTarget
            const offsets = getPageOffsets(viewport, pageCount)
            let nearestPage = 0
            offsets.forEach((offset, page) => {
              if (
                Math.abs(offset - viewport.scrollLeft) <
                Math.abs(offsets[nearestPage] - viewport.scrollLeft)
              ) {
                nearestPage = page
              }
            })
            setActivePage(nearestPage)
          }}
        >
          <div className="hf-location-grid hf-location-grid--aspect-rectangle">
            {slots.map((item, slotIndex) => {
              const invalidItem = invalidItemsBySlot.get(slotIndex + 1)
              if (!item) {
                return (
                  <button
                    key={`slot-${slotIndex + 1}`}
                    type="button"
                    className={`hf-location-grid-card empty${invalidItem ? ' invalid' : ''}`}
                    onClick={() => onSlotClick(slotIndex)}
                  >
                    <span className="hf-slot-card-num">{slotIndex + 1}</span>
                    {invalidItem ? (
                      <>
                        <span style={{ fontSize: '1.4rem' }}>⚠</span>
                        <span className="hf-location-grid-empty-label">
                          {getInvalidMessage(invalidItem)}
                        </span>
                        <span className="hf-location-grid-empty-hint">
                          Click to replace
                        </span>
                      </>
                    ) : (
                      <>
                        <span
                          style={{ fontSize: '1.7rem', color: 'var(--muted)' }}
                        >
                          ＋
                        </span>
                        <span className="hf-location-grid-empty-label">
                          Add {itemLabel}
                        </span>
                      </>
                    )}
                  </button>
                )
              }

              const imageSrc =
                typeof item.imageUrl === 'string' && item.imageUrl.trim()
                  ? item.imageUrl.trim()
                  : null
              const priceDollars = formatPriceLevelDollars(item.priceLevel)

              return (
                <CuratedSlotSwapWrap
                  key={`slot-${slotIndex + 1}`}
                  slotIndex={slotIndex}
                >
                  <button
                    type="button"
                    className="hf-location-grid-card hf-location-grid-card--filled hf-curated-slot-replace"
                    onClick={() => onSlotClick(slotIndex)}
                  >
                    <span className="hf-slot-card-num">{slotIndex + 1}</span>
                    {imageSrc ? (
                      <div className="hf-location-grid-media">
                        <img
                          src={imageSrc}
                          alt={item.title}
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                    ) : null}
                    <div className="hf-location-grid-body">
                      <div className="hf-location-grid-meta">
                        <span className="hf-level-tag">
                          {item.type ?? 'hotel'}
                        </span>
                        {priceDollars ? (
                          <span className="hf-location-grid-subtitle">
                            {priceDollars}
                          </span>
                        ) : null}
                      </div>
                      <p className="hf-location-grid-title">{item.title}</p>
                      <p className="hf-location-grid-key">
                        {item.location ?? item.slug ?? 'No location'}
                      </p>
                    </div>
                  </button>
                  {onRemove ? (
                    <button
                      type="button"
                      className="hf-location-grid-remove"
                      aria-label={`Remove ${itemLabel} ${item.title}`}
                      title={`Remove ${itemLabel}`}
                      onClick={() => onRemove(slotIndex)}
                    >
                      ×
                    </button>
                  ) : null}
                </CuratedSlotSwapWrap>
              )
            })}
            {canAppend ? (
              <button
                type="button"
                className="hf-location-grid-card empty hf-location-grid-card--append"
                onClick={onAppend}
              >
                <span
                  className="hf-location-grid-append-icon"
                  aria-hidden="true"
                >
                  ＋
                </span>
                <span className="hf-location-grid-empty-label">
                  Add another {itemLabel}
                </span>
                <span className="hf-location-grid-empty-hint">
                  {slots.length} / {maxItems} cards
                </span>
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </CuratedSlotSwapProvider>
  )
}

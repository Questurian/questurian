import {
  CuratedSlotSwapProvider,
  CuratedSlotSwapWrap
} from './CuratedArticleSlotSwap'
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

export default function HotelGridLayout({
  slots,
  invalidItemsBySlot,
  onSlotClick,
  onReorder,
  itemLabel = 'hotel'
}: {
  slots: HotelGridSlotValue[]
  invalidItemsBySlot: Map<number, HomepageHotelGridInvalidItem>
  onSlotClick: (slotIndex: number) => void
  onReorder: (newSlots: HotelGridSlotValue[]) => void
  itemLabel?: string
}) {
  return (
    <CuratedSlotSwapProvider slots={slots} onReorder={onReorder}>
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
                    <span style={{ fontSize: '1.7rem', color: 'var(--muted)' }}>
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
                    <span className="hf-level-tag">{item.type ?? 'hotel'}</span>
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
            </CuratedSlotSwapWrap>
          )
        })}
      </div>
    </CuratedSlotSwapProvider>
  )
}

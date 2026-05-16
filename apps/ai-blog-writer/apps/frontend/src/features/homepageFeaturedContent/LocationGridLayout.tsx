import {
  CuratedSlotSwapProvider,
  CuratedSlotSwapWrap
} from './CuratedArticleSlotSwap'
import type {
  HomepageLocationGridInvalidItem,
  HomepageLocationGridLevel,
  LocationGridMediaAspect
} from './locationGridTypes'
import type { LocationGridSlotValue } from './useHomepageLocationGridSlots'

function getInvalidMessage(item: HomepageLocationGridInvalidItem): string {
  if (item.reason === 'not_found') return 'Location not found'
  if (item.reason === 'invalid_scope') return 'No longer eligible'
  return 'Invalid location'
}

type Props = {
  slots: LocationGridSlotValue[]
  childLevel: HomepageLocationGridLevel
  mediaAspect?: LocationGridMediaAspect
  invalidItemsBySlot: Map<number, HomepageLocationGridInvalidItem>
  onSlotClick: (slotIndex: number) => void
  onRemove: (slotIndex: number) => void
  onReorder: (newSlots: LocationGridSlotValue[]) => void
}

export default function LocationGridLayout({
  slots,
  childLevel,
  mediaAspect = 'rectangle',
  invalidItemsBySlot,
  onSlotClick,
  onRemove,
  onReorder
}: Props) {
  const emptyLabel = childLevel === 'city' ? 'Add city' : 'Add neighborhood'

  return (
    <CuratedSlotSwapProvider slots={slots} onReorder={onReorder}>
      <div
        className={`hf-location-grid hf-location-grid--aspect-${mediaAspect}`}
      >
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
                      {emptyLabel}
                    </span>
                  </>
                )}
              </button>
            )
          }

          return (
            <CuratedSlotSwapWrap
              key={`slot-${slotIndex + 1}`}
              slotIndex={slotIndex}
            >
              <article
                className="hf-location-grid-card hf-location-grid-card--filled"
                onClick={() => onSlotClick(slotIndex)}
              >
                <span className="hf-slot-card-num">{slotIndex + 1}</span>
                {item.coverImageUrl ? (
                  <div className="hf-location-grid-media">
                    <img
                      src={item.coverImageUrl}
                      alt={item.coverImageAlt ?? item.title}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                ) : null}
                <div className="hf-location-grid-body">
                  <div className="hf-location-grid-meta">
                    <span className="hf-level-tag">{item.level}</span>
                    {item.subtitle && (
                      <span className="hf-location-grid-subtitle">
                        {item.subtitle}
                      </span>
                    )}
                  </div>
                  <p className="hf-location-grid-title">{item.title}</p>
                  <p className="hf-location-grid-key">
                    {item.locationKey ?? 'No location key'}
                  </p>
                  <div className="hf-location-grid-actions">
                    <button
                      type="button"
                      className="hf-btn-ghost"
                      onClick={(event) => {
                        event.stopPropagation()
                        onSlotClick(slotIndex)
                      }}
                      style={{
                        fontSize: '0.78rem',
                        padding: '0.25rem 0.6rem',
                        minHeight: '1.8rem'
                      }}
                    >
                      Swap
                    </button>
                    <button
                      type="button"
                      className="hf-btn-icon danger"
                      title="Remove"
                      onClick={(event) => {
                        event.stopPropagation()
                        onRemove(slotIndex)
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              </article>
            </CuratedSlotSwapWrap>
          )
        })}
      </div>
    </CuratedSlotSwapProvider>
  )
}

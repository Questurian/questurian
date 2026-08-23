import { CuratedSlotSwapProvider, CuratedSlotSwapWrap } from './CuratedArticleSlotSwap'
import type {
  HomepageLocationGridInvalidItem,
  HomepageLocationGridLevel,
  LocationGridMediaAspect
} from './locationGridTypes'
import type { LocationGridSlotValue } from './useHomepageLocationGridSlots'
import {
  LOCATION_GRID_DESCRIPTION_MAX_LENGTH,
  LOCATION_GRID_KICKER_MAX_LENGTH
} from './locationGridTypes'

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
  onKickerChange: (slotIndex: number, kicker: string) => void
  onDescriptionChange: (slotIndex: number, description: string) => void
  onReorder: (newSlots: LocationGridSlotValue[]) => void
}

export default function LocationGridLayout({
  slots,
  childLevel,
  mediaAspect = 'rectangle',
  invalidItemsBySlot,
  onSlotClick,
  onKickerChange,
  onDescriptionChange,
  onReorder
}: Props) {
  const emptyLabel = childLevel === 'city' ? 'Add city' : 'Add neighborhood'

  return (
    <CuratedSlotSwapProvider slots={slots} onReorder={onReorder}>
      <div className={`hf-location-grid hf-location-grid--aspect-${mediaAspect}`}>
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
                    <span className="hf-location-grid-empty-hint">Click to replace</span>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: '1.7rem', color: 'var(--muted)' }}>＋</span>
                    <span className="hf-location-grid-empty-label">{emptyLabel}</span>
                  </>
                )}
              </button>
            )
          }

          return (
            <CuratedSlotSwapWrap key={`slot-${slotIndex + 1}`} slotIndex={slotIndex}>
              <article className="hf-location-grid-card hf-location-guide-card">
                <button
                  type="button"
                  className="hf-location-guide-replace hf-curated-slot-replace"
                  aria-label={`Replace ${item.title}`}
                  onClick={() => onSlotClick(slotIndex)}
                >
                  <span className="hf-slot-card-num">{slotIndex + 1}</span>
                  {item.coverImageUrl ? (
                    <img
                      className="hf-location-guide-image"
                      src={item.coverImageUrl}
                      alt={item.coverImageAlt ?? item.title}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : null}
                  <span className="hf-location-guide-shade" aria-hidden="true" />
                  <span className="hf-location-guide-copy">
                    <span className="hf-location-guide-rule" aria-hidden="true" />
                    <span className="hf-location-guide-title">{item.title}</span>
                  </span>
                </button>
                <label className="hf-location-guide-kicker-editor">
                  <span className="hf-sr-only">Kicker for {item.title}</span>
                  <input
                    aria-label={`Kicker for ${item.title}`}
                    value={item.kicker ?? ''}
                    maxLength={LOCATION_GRID_KICKER_MAX_LENGTH}
                    placeholder="Destination guides"
                    onChange={(event) => onKickerChange(slotIndex, event.target.value)}
                  />
                  <span className="hf-location-guide-kicker-count">
                    {(item.kicker ?? '').length} / {LOCATION_GRID_KICKER_MAX_LENGTH}
                  </span>
                </label>
                <label className="hf-location-guide-description-editor">
                  <span className="hf-sr-only">Supporting text for {item.title}</span>
                  <textarea
                    aria-label={`Supporting text for ${item.title}`}
                    value={item.description ?? ''}
                    maxLength={LOCATION_GRID_DESCRIPTION_MAX_LENGTH}
                    rows={3}
                    placeholder="Add a short reason to explore this location…"
                    onChange={(event) => onDescriptionChange(slotIndex, event.target.value)}
                  />
                  <span className="hf-location-guide-character-count">
                    {(item.description ?? '').length} / {LOCATION_GRID_DESCRIPTION_MAX_LENGTH}
                  </span>
                </label>
              </article>
            </CuratedSlotSwapWrap>
          )
        })}
      </div>
    </CuratedSlotSwapProvider>
  )
}

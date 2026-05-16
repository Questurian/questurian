import {
  CuratedSlotSwapProvider,
  CuratedSlotSwapWrap
} from './CuratedArticleSlotSwap'
import type { HomepageFeaturedInvalidItem } from './types'
import type { SlotValue } from './useHomepageFeaturedSlots'

function getInvalidMessage(item: HomepageFeaturedInvalidItem): string {
  if (item.reason === 'not_published') return 'No longer published'
  if (item.reason === 'not_found') return 'Listicle not found'
  return 'Invalid reference'
}

function MapsPinIcon() {
  return (
    <svg
      className="hf-questurian-maps-pin"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
      />
    </svg>
  )
}

type Props = {
  slots: SlotValue[]
  invalidItemsBySlot: Map<number, HomepageFeaturedInvalidItem>
  onSlotClick: (slotIndex: number) => void
  onRemove: (slotIndex: number) => void
  onReorder: (newSlots: SlotValue[]) => void
}

export default function QuesturianMapsArticleLayout({
  slots,
  invalidItemsBySlot,
  onSlotClick,
  onRemove,
  onReorder
}: Props) {
  return (
    <CuratedSlotSwapProvider slots={slots} onReorder={onReorder}>
      <section className="hf-questurian-maps" aria-label="Questurian Maps">
        <div className="hf-questurian-maps-rule" />
        <header className="hf-questurian-maps-header">
          <MapsPinIcon />
          <span className="hf-questurian-maps-title">Questurian Maps</span>
        </header>
        <div className="hf-questurian-maps-rule" />
        <div className="hf-questurian-maps-grid">
          {slots.map((item, slotIndex) => {
            const invalidItem = invalidItemsBySlot.get(slotIndex + 1)

            if (!item) {
              return (
                <button
                  key={`slot-${slotIndex + 1}`}
                  type="button"
                  className={`hf-questurian-maps-cell empty${invalidItem ? ' invalid' : ''}`}
                  onClick={() => onSlotClick(slotIndex)}
                >
                  <span className="hf-slot-card-num">{slotIndex + 1}</span>
                  {invalidItem ? (
                    <>
                      <span className="hf-questurian-maps-empty-warn">⚠</span>
                      <span className="hf-questurian-maps-empty-text">
                        {getInvalidMessage(invalidItem)}
                      </span>
                      <span className="hf-questurian-maps-empty-hint">
                        Click to replace
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="hf-questurian-maps-empty-plus">＋</span>
                      <span className="hf-questurian-maps-empty-text">
                        Add listicle
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
                <article className="hf-questurian-maps-cell filled">
                  <span className="hf-slot-card-num">{slotIndex + 1}</span>
                  <div className="hf-questurian-maps-row">
                    {item.imageUrl ? (
                      <div className="hf-questurian-maps-thumb">
                        <img
                          src={item.imageUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                    ) : (
                      <div className="hf-questurian-maps-thumb hf-questurian-maps-thumb--placeholder" />
                    )}
                    <div className="hf-questurian-maps-copy">
                      <p className="hf-questurian-maps-headline">
                        {item.title}
                      </p>
                      <div className="hf-questurian-maps-actions">
                        <button
                          type="button"
                          className="hf-btn-ghost"
                          onClick={() => onSlotClick(slotIndex)}
                          style={{
                            fontSize: '0.78rem',
                            padding: '0.2rem 0.55rem',
                            minHeight: '1.65rem'
                          }}
                        >
                          Swap
                        </button>
                        <button
                          type="button"
                          className="hf-btn-icon danger"
                          title="Remove"
                          onClick={() => onRemove(slotIndex)}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              </CuratedSlotSwapWrap>
            )
          })}
        </div>
        <div className="hf-questurian-maps-rule" />
      </section>
    </CuratedSlotSwapProvider>
  )
}

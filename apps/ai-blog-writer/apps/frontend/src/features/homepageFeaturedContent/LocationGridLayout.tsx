import type { MouseEvent } from 'react'

import type {
  HomepageLocationGridInvalidItem,
  HomepageLocationGridLevel,
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
  invalidItemsBySlot: Map<number, HomepageLocationGridInvalidItem>
  onSlotClick: (slotIndex: number) => void
  onMove: (slotIndex: number, direction: -1 | 1) => void
  onRemove: (slotIndex: number) => void
}

export default function LocationGridLayout({
  slots,
  childLevel,
  invalidItemsBySlot,
  onSlotClick,
  onMove,
  onRemove,
}: Props) {
  const emptyLabel = childLevel === 'city' ? 'Add city' : 'Add neighborhood'

  function stopEvent(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
  }

  return (
    <div className="hf-location-grid">
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
          <article key={`slot-${slotIndex + 1}`} className="hf-location-grid-card">
            <span className="hf-slot-card-num">{slotIndex + 1}</span>
            <div className="hf-location-grid-body">
              <div className="hf-location-grid-meta">
                <span className="hf-level-tag">{item.level}</span>
                {item.subtitle && (
                  <span className="hf-location-grid-subtitle">{item.subtitle}</span>
                )}
              </div>
              <p className="hf-location-grid-title">{item.title}</p>
              <p className="hf-location-grid-key">{item.locationKey ?? 'No location key'}</p>
              <div className="hf-location-grid-actions">
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

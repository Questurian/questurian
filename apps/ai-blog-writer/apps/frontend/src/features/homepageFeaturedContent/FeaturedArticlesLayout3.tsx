import type { SlotValue } from './useHomepageFeaturedSlots'
import type { HomepageFeaturedInvalidItem } from './types'

function formatDate(value: string | null): string {
  if (!value) return ''
  const ts = Date.parse(value)
  if (Number.isNaN(ts)) return ''
  return new Date(ts).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function ImgPlaceholder() {
  return (
    <svg
      style={{ width: '38%', height: '38%', color: 'var(--muted)', opacity: 0.4 }}
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

type SlotCardProps = {
  slotIndex: number
  item: SlotValue
  invalid: HomepageFeaturedInvalidItem | undefined
  onClick: () => void
}

// ── Hero card (slot 1, left — large) ─────────────────────────────
function CardHero({ slotIndex, item, invalid, onClick }: SlotCardProps) {
  const num = slotIndex + 1

  if (!item) {
    return (
      <button type="button" className={`hf-l3-card-hero${invalid ? ' invalid' : ''}`} onClick={onClick}>
        <div className="hf-l3-hero-empty">
          <span className="hf-l3-num" style={{ position: 'static' }}>{num}</span>
          {invalid ? (
            <>
              <span style={{ fontSize: '1.4rem' }}>⚠</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--error)', fontWeight: 600 }}>
                {invalid.reason === 'not_published' ? 'No longer published' : 'Not found'}
              </span>
            </>
          ) : (
            <>
              <span style={{ fontSize: '2rem' }}>＋</span>
              <span>Add hero article</span>
            </>
          )}
        </div>
      </button>
    )
  }

  return (
    <button type="button" className="hf-l3-card-hero" onClick={onClick}>
      <div className="hf-l3-hero-img">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" loading="lazy" />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(220,218,214,0.35)' }}>
            <ImgPlaceholder />
          </div>
        )}
        <span className="hf-l3-num">{num}</span>
      </div>
      <div className="hf-l3-hero-body">
        <p className="hf-l3-label">{item.collectionLabel}</p>
        <p className="hf-l3-hero-title">{item.title}</p>
      </div>
    </button>
  )
}

// ── Stacked image card (slots 2 & 3, right column) ───────────────
function CardImg({ slotIndex, item, invalid, onClick }: SlotCardProps) {
  const num = slotIndex + 1
  const date = formatDate(item?.publishedAt ?? item?.updatedAt ?? null)

  return (
    <button
      type="button"
      className={`hf-l3-card-img${invalid ? ' invalid' : ''}`}
      onClick={onClick}
    >
      <div className="hf-l3-img-thumb">
        {item?.imageUrl ? (
          <img src={item.imageUrl} alt="" loading="lazy" />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(220,218,214,0.35)' }}>
            <ImgPlaceholder />
          </div>
        )}
        <span className="hf-l3-num">{num}</span>
      </div>
      <div className="hf-l3-img-body">
        {item ? (
          <>
            <p className="hf-l3-label">{item.collectionLabel}</p>
            <p className="hf-l3-img-title">{item.title}</p>
            {date && <p className="hf-l3-date">{date}</p>}
          </>
        ) : invalid ? (
          <p className="hf-l3-img-title" style={{ color: 'var(--error)' }}>
            {invalid.reason === 'not_published' ? 'No longer published' : 'Not found'}
          </p>
        ) : (
          <p className="hf-l3-img-title" style={{ color: 'var(--muted)', fontWeight: 400 }}>＋ Add article</p>
        )}
      </div>
    </button>
  )
}

// ── Main layout ───────────────────────────────────────────────────
type Props = {
  slots: SlotValue[]
  invalidItemsBySlot: Map<number, HomepageFeaturedInvalidItem>
  onSlotClick: (slotIndex: number) => void
}

export default function FeaturedArticlesLayout3({ slots, invalidItemsBySlot, onSlotClick }: Props) {
  function invalid(i: number) {
    return invalidItemsBySlot.get(i + 1)
  }

  return (
    <div className="hf-l3">
      {/* Slot 1 — hero left */}
      <CardHero slotIndex={0} item={slots[0] ?? null} invalid={invalid(0)} onClick={() => onSlotClick(0)} />

      {/* Slots 2 & 3 — stacked right */}
      <div className="hf-l3-right">
        <CardImg slotIndex={1} item={slots[1] ?? null} invalid={invalid(1)} onClick={() => onSlotClick(1)} />
        <CardImg slotIndex={2} item={slots[2] ?? null} invalid={invalid(2)} onClick={() => onSlotClick(2)} />
      </div>
    </div>
  )
}

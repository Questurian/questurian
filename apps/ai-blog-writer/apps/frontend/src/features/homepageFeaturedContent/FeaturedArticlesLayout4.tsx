import type { SlotValue } from './useHomepageFeaturedSlots'
import type { HomepageFeaturedInvalidItem } from './types'

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

// ── Hero card (slot 1, left) ──────────────────────────────────────
function CardHero({ slotIndex, item, invalid, onClick }: SlotCardProps) {
  const num = slotIndex + 1

  if (!item) {
    return (
      <button type="button" className={`hf-l4-card-hero${invalid ? ' invalid' : ''}`} onClick={onClick}>
        <div className="hf-l4-hero-img-empty">
          <span className="hf-l4-num">{num}</span>
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
        <div className="hf-l4-hero-body" />
      </button>
    )
  }

  return (
    <button type="button" className="hf-l4-card-hero" onClick={onClick}>
      <div className="hf-l4-hero-img">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" loading="lazy" />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(220,218,214,0.35)' }}>
            <ImgPlaceholder />
          </div>
        )}
        <span className="hf-l4-num">{num}</span>
      </div>
      <div className="hf-l4-hero-body">
        <p className="hf-l4-hero-label">{item.collectionLabel}</p>
        <p className="hf-l4-hero-title">{item.title}</p>
      </div>
    </button>
  )
}

// ── Horizontal card (slots 2-4, right column) ─────────────────────
function CardHoriz({ slotIndex, item, invalid, onClick }: SlotCardProps) {
  const num = slotIndex + 1

  return (
    <button
      type="button"
      className={`hf-l4-card-horiz${invalid ? ' invalid' : ''}`}
      onClick={onClick}
    >
      <div className="hf-l4-horiz-thumb">
        {item?.imageUrl ? (
          <img src={item.imageUrl} alt="" loading="lazy" />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(220,218,214,0.35)' }}>
            <ImgPlaceholder />
          </div>
        )}
        <span className="hf-l4-num">{num}</span>
      </div>
      <div className="hf-l4-horiz-body">
        {item ? (
          <>
            <p className="hf-l4-horiz-label">{item.collectionLabel}</p>
            <p className="hf-l4-horiz-title">{item.title}</p>
          </>
        ) : invalid ? (
          <p className="hf-l4-horiz-title" style={{ color: 'var(--error)', fontWeight: 600 }}>
            {invalid.reason === 'not_published' ? 'No longer published' : 'Not found'}
          </p>
        ) : (
          <p className="hf-l4-horiz-title" style={{ color: 'var(--muted)', fontWeight: 400 }}>
            ＋ Add article
          </p>
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

export default function FeaturedArticlesLayout4({ slots, invalidItemsBySlot, onSlotClick }: Props) {
  function invalid(i: number) {
    return invalidItemsBySlot.get(i + 1)
  }

  return (
    <div className="hf-l4">
      {/* ── Left: slot 1, hero ── */}
      <CardHero slotIndex={0} item={slots[0] ?? null} invalid={invalid(0)} onClick={() => onSlotClick(0)} />

      {/* ── Right: slots 2–4, horizontal cards ── */}
      <div className="hf-l4-right">
        {[1, 2, 3].map((i) => (
          <CardHoriz
            key={i}
            slotIndex={i}
            item={slots[i] ?? null}
            invalid={invalid(i)}
            onClick={() => onSlotClick(i)}
          />
        ))}
      </div>
    </div>
  )
}

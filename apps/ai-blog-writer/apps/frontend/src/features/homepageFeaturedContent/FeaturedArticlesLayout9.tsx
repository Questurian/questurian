import type { SlotValue } from './useHomepageFeaturedSlots'
import type { HomepageFeaturedInvalidItem } from './types'

function ImgPlaceholder() {
  return (
    <svg
      style={{ width: '40%', height: '40%', color: 'var(--muted)', opacity: 0.4 }}
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

// ── Left column card (slots 1 & 2) ───────────────────────────────
function CardA({ slotIndex, item, invalid, onClick }: SlotCardProps) {
  const num = slotIndex + 1

  if (!item) {
    return (
      <button
        type="button"
        className={`hf-l9-card-a hf-l9-empty${invalid ? ' invalid' : ''}`}
        onClick={onClick}
        style={{ width: '100%', background: 'none', padding: 0, textAlign: 'left' }}
      >
        <div className="hf-l9-empty" style={{ width: '100%', minHeight: 160 }}>
          <span className="hf-l9-num" style={{ position: 'static' }}>{num}</span>
          {invalid ? (
            <>
              <span style={{ fontSize: '1.2rem' }}>⚠</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--error)', fontWeight: 600 }}>
                {invalid.reason === 'not_published' ? 'No longer published' : 'Not found'}
              </span>
            </>
          ) : (
            <>
              <span style={{ fontSize: '1.4rem' }}>＋</span>
              <span>Add article</span>
            </>
          )}
        </div>
      </button>
    )
  }

  return (
    <button type="button" className="hf-l9-card-a" onClick={onClick} style={{ width: '100%', background: 'none', border: 'none', padding: 0, textAlign: 'left' }}>
      <div className="hf-l9-thumb">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" loading="lazy" />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(220,218,214,0.35)' }}>
            <ImgPlaceholder />
          </div>
        )}
        <span className="hf-l9-num">{num}</span>
      </div>
      <div className="hf-l9-body">
        <p className="hf-l9-label">{item.collectionLabel}</p>
        <p className="hf-l9-title">{item.title}</p>
      </div>
    </button>
  )
}

// ── Hero card (slot 3, center top) ───────────────────────────────
function CardHero({ slotIndex, item, invalid, onClick }: SlotCardProps) {
  const num = slotIndex + 1

  if (!item) {
    return (
      <button
        type="button"
        className={`hf-l9-card-hero${invalid ? ' invalid' : ''}`}
        onClick={onClick}
        style={{ width: '100%', background: 'none', border: 'none', padding: 0, textAlign: 'left' }}
      >
        <div className="hf-l9-empty" style={{ minHeight: 240 }}>
          <span className="hf-l9-num" style={{ position: 'static' }}>{num}</span>
          {invalid ? (
            <>
              <span style={{ fontSize: '1.2rem' }}>⚠</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--error)', fontWeight: 600 }}>
                {invalid.reason === 'not_published' ? 'No longer published' : 'Not found'}
              </span>
            </>
          ) : (
            <>
              <span style={{ fontSize: '1.6rem' }}>＋</span>
              <span>Add hero article</span>
            </>
          )}
        </div>
      </button>
    )
  }

  return (
    <button type="button" className="hf-l9-card-hero" onClick={onClick} style={{ width: '100%', background: 'none', border: 'none', padding: 0, textAlign: 'left' }}>
      <div className="hf-l9-thumb">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" loading="lazy" />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(220,218,214,0.35)' }}>
            <ImgPlaceholder />
          </div>
        )}
        <span className="hf-l9-num">{num}</span>
      </div>
      <div className="hf-l9-body">
        <p className="hf-l9-label">{item.collectionLabel}</p>
        <p className="hf-l9-title">{item.title}</p>
      </div>
    </button>
  )
}

// ── Horizontal card (slot 4, center bottom) ───────────────────────
function CardHoriz({ slotIndex, item, invalid, onClick }: SlotCardProps) {
  const num = slotIndex + 1

  if (!item) {
    return (
      <button
        type="button"
        className={`hf-l9-card-horiz${invalid ? ' invalid' : ''}`}
        onClick={onClick}
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <div className="hf-l9-body">
          <div className="hf-l9-num-row">
            <span className="hf-l9-num" style={{ position: 'static' }}>{num}</span>
          </div>
          <p className="hf-l9-title" style={{ color: 'var(--muted)', fontWeight: 400 }}>＋ Add article</p>
        </div>
        <div className="hf-l9-thumb hf-l9-empty" style={{ minHeight: 'unset' }} />
      </button>
    )
  }

  return (
    <button type="button" className="hf-l9-card-horiz" onClick={onClick} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer' }}>
      <div className="hf-l9-body">
        <div className="hf-l9-num-row">
          <span className="hf-l9-num" style={{ position: 'static' }}>{num}</span>
          <p className="hf-l9-label">{item.collectionLabel}</p>
        </div>
        <p className="hf-l9-title">{item.title}</p>
      </div>
      <div className="hf-l9-thumb">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" loading="lazy" />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(220,218,214,0.35)' }}>
            <ImgPlaceholder />
          </div>
        )}
      </div>
    </button>
  )
}

// ── List card (slots 5-9, right column) ──────────────────────────
function CardList({ slotIndex, item, invalid, onClick }: SlotCardProps) {
  const num = slotIndex + 1

  if (!item) {
    return (
      <button
        type="button"
        className={`hf-l9-card-list${invalid ? ' invalid' : ''}`}
        onClick={onClick}
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
      >
        <div className="hf-l9-body">
          <div className="hf-l9-num-row">
            <span className="hf-l9-num">{num}</span>
            <p className="hf-l9-title" style={{ color: 'var(--muted)', fontWeight: 400 }}>
              {invalid ? (invalid.reason === 'not_published' ? 'No longer published' : 'Not found') : '＋ Add article'}
            </p>
          </div>
        </div>
        <div className="hf-l9-thumb hf-l9-empty" style={{ minHeight: 'unset', padding: 0 }} />
      </button>
    )
  }

  return (
    <button type="button" className="hf-l9-card-list" onClick={onClick} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer' }}>
      <div className="hf-l9-body">
        <div className="hf-l9-num-row">
          <span className="hf-l9-num">{num}</span>
          <p className="hf-l9-label">{item.collectionLabel}</p>
        </div>
        <p className="hf-l9-title">{item.title}</p>
      </div>
      <div className="hf-l9-thumb">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" loading="lazy" />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(220,218,214,0.35)' }}>
            <ImgPlaceholder />
          </div>
        )}
      </div>
    </button>
  )
}

// ── Main layout component ─────────────────────────────────────────
type Props = {
  slots: SlotValue[]
  invalidItemsBySlot: Map<number, HomepageFeaturedInvalidItem>
  onSlotClick: (slotIndex: number) => void
}

export default function FeaturedArticlesLayout9({ slots, invalidItemsBySlot, onSlotClick }: Props) {
  function invalid(slotIndex: number) {
    return invalidItemsBySlot.get(slotIndex + 1)
  }

  return (
    <div className="hf-l9">
      {/* ── Left column: slots 1 & 2 ── */}
      <div className="hf-l9-left">
        <CardA slotIndex={0} item={slots[0] ?? null} invalid={invalid(0)} onClick={() => onSlotClick(0)} />
        <CardA slotIndex={1} item={slots[1] ?? null} invalid={invalid(1)} onClick={() => onSlotClick(1)} />
      </div>

      {/* ── Center column: slot 3 (hero) + slot 4 (horiz) ── */}
      <div className="hf-l9-center">
        <CardHero slotIndex={2} item={slots[2] ?? null} invalid={invalid(2)} onClick={() => onSlotClick(2)} />
        <CardHoriz slotIndex={3} item={slots[3] ?? null} invalid={invalid(3)} onClick={() => onSlotClick(3)} />
      </div>

      {/* ── Right column: slots 5–9 ── */}
      <div className="hf-l9-right">
        {[4, 5, 6, 7, 8].map((i) => (
          <CardList
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

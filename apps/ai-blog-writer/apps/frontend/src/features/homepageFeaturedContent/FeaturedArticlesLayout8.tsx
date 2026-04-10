import type { SlotValue } from './useHomepageFeaturedSlots'
import type { HomepageFeaturedInvalidItem } from './types'

function formatShortDate(value: string | null): string {
  if (!value) return ''
  const ts = Date.parse(value)
  if (Number.isNaN(ts)) return ''
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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

// ── Text-only list item (slots 1-5, left column) ──────────────────
function CardText({ slotIndex, item, invalid, onClick }: SlotCardProps) {
  const num = slotIndex + 1

  return (
    <button
      type="button"
      className={`hf-l8-card-text${invalid ? ' invalid' : ''}`}
      onClick={onClick}
    >
      <div className="hf-l8-text-meta">
        <span className="hf-l8-num">{num}</span>
        {item ? (
          <>
            <span className="hf-l8-date">{formatShortDate(item.publishedAt ?? item.updatedAt)}</span>
            <span className="hf-l8-tag">{item.collectionLabel}</span>
          </>
        ) : invalid ? (
          <span className="hf-l8-tag" style={{ color: 'var(--error)' }}>
            {invalid.reason === 'not_published' ? 'No longer published' : 'Not found'}
          </span>
        ) : (
          <span className="hf-l8-tag" style={{ color: 'var(--muted)', fontWeight: 400 }}>Empty slot</span>
        )}
      </div>
      <p className="hf-l8-text-title">
        {item ? item.title : <span style={{ color: 'var(--muted)', fontWeight: 400 }}>＋ Add article</span>}
      </p>
    </button>
  )
}

// ── Hero card (slot 6, center) ────────────────────────────────────
function CardHero({ slotIndex, item, invalid, onClick }: SlotCardProps) {
  const num = slotIndex + 1

  if (!item) {
    return (
      <button type="button" className={`hf-l8-card-hero${invalid ? ' invalid' : ''}`} onClick={onClick}>
        <div className="hf-l8-hero-empty">
          <span className="hf-l8-num">{num}</span>
          {invalid ? (
            <>
              <span style={{ fontSize: '1.4rem' }}>⚠</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--error)', fontWeight: 600 }}>
                {invalid.reason === 'not_published' ? 'No longer published' : 'Not found'}
              </span>
            </>
          ) : (
            <>
              <span style={{ fontSize: '1.8rem' }}>＋</span>
              <span>Add hero article</span>
            </>
          )}
        </div>
      </button>
    )
  }

  return (
    <button type="button" className="hf-l8-card-hero" onClick={onClick}>
      <div className="hf-l8-hero-thumb">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" loading="lazy" />
        ) : (
          <div className="hf-l8-hero-thumb-empty"><ImgPlaceholder /></div>
        )}
        <span className="hf-l8-num">{num}</span>
      </div>
      <div className="hf-l8-hero-body">
        <p className="hf-l8-hero-label">{item.collectionLabel}</p>
        <p className="hf-l8-hero-title">{item.title}</p>
      </div>
    </button>
  )
}

// ── Image card (slots 7-8, right column) ─────────────────────────
function CardImg({ slotIndex, item, invalid, onClick }: SlotCardProps) {
  const num = slotIndex + 1

  if (!item) {
    return (
      <button type="button" className={`hf-l8-card-img${invalid ? ' invalid' : ''}`} onClick={onClick}>
        <div className="hf-l8-img-empty">
          <span className="hf-l8-num">{num}</span>
          {invalid ? (
            <span style={{ fontSize: '0.82rem', color: 'var(--error)', fontWeight: 600 }}>
              {invalid.reason === 'not_published' ? 'No longer published' : 'Not found'}
            </span>
          ) : (
            <span>＋ Add article</span>
          )}
        </div>
        <div className="hf-l8-img-body" />
      </button>
    )
  }

  return (
    <button type="button" className="hf-l8-card-img" onClick={onClick}>
      <div className="hf-l8-img-thumb">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" loading="lazy" />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(220,218,214,0.35)' }}>
            <ImgPlaceholder />
          </div>
        )}
        <span className="hf-l8-num">{num}</span>
      </div>
      <div className="hf-l8-img-body">
        <p className="hf-l8-tag">{item.collectionLabel}</p>
        <p className="hf-l8-img-title">{item.title}</p>
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

export default function FeaturedArticlesLayout8({ slots, invalidItemsBySlot, onSlotClick }: Props) {
  function invalid(i: number) {
    return invalidItemsBySlot.get(i + 1)
  }

  return (
    <div className="hf-l8">
      {/* ── Left: slots 1–5, text list ── */}
      <div className="hf-l8-left">
        {[0, 1, 2, 3, 4].map((i) => (
          <CardText
            key={i}
            slotIndex={i}
            item={slots[i] ?? null}
            invalid={invalid(i)}
            onClick={() => onSlotClick(i)}
          />
        ))}
      </div>

      {/* ── Center: slot 6, hero ── */}
      <div className="hf-l8-center">
        <CardHero slotIndex={5} item={slots[5] ?? null} invalid={invalid(5)} onClick={() => onSlotClick(5)} />
      </div>

      {/* ── Right: slots 7–8, image cards ── */}
      <div className="hf-l8-right">
        <CardImg slotIndex={6} item={slots[6] ?? null} invalid={invalid(6)} onClick={() => onSlotClick(6)} />
        <CardImg slotIndex={7} item={slots[7] ?? null} invalid={invalid(7)} onClick={() => onSlotClick(7)} />
      </div>
    </div>
  )
}

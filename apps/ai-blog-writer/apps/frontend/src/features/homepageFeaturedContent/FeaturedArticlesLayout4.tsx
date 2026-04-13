import type { SlotValue } from './useHomepageFeaturedSlots'
import type { HomepageFeaturedInvalidItem } from './types'
import type { FeaturedArticlesSlot4Layout } from './pageBlocks'

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

function formatShortRelative(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const ms = Date.now() - d.getTime()
  const days = Math.floor(ms / 86400000)
  if (days < 1) return 'Today'
  if (days === 1) return '1d ago'
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function metaLine(item: SlotValue): string {
  if (!item) return ''
  const rel = formatShortRelative(item.publishedAt ?? item.updatedAt)
  const by = item.authorLabel
    ? (item.authorLabel.toLowerCase().startsWith('by ') ? item.authorLabel : `By ${item.authorLabel}`)
    : ''
  if (rel && by) return `${rel} · ${by}`
  return rel || by
}

type SlotCardProps = {
  slotIndex: number
  item: SlotValue
  invalid: HomepageFeaturedInvalidItem | undefined
  onClick: () => void
}

// ── Default layout: hero left + sidebar stack ────────────────────
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

// ── one-over-three: top text | image, bottom 3 columns ───────────
function LeadTopRow({ slotIndex, item, invalid, onClick }: SlotCardProps) {
  const num = slotIndex + 1

  if (!item) {
    return (
      <button type="button" className={`hf-l4-o3-lead${invalid ? ' invalid' : ''}`} onClick={onClick}>
        <div className="hf-l4-o3-lead-copy hf-l4-o3-lead-copy-empty">
          <span className="hf-l4-num hf-l4-num-inline">{num}</span>
          {invalid ? (
            <span style={{ color: 'var(--error)', fontWeight: 600 }}>
              {invalid.reason === 'not_published' ? 'No longer published' : 'Not found'}
            </span>
          ) : (
            <span style={{ color: 'var(--muted)' }}>＋ Add lead article</span>
          )}
        </div>
        <div className="hf-l4-o3-lead-visual hf-l4-o3-lead-visual-empty">
          <ImgPlaceholder />
        </div>
      </button>
    )
  }

  return (
    <button type="button" className="hf-l4-o3-lead" onClick={onClick}>
      <div className="hf-l4-o3-lead-copy">
        <span className="hf-l4-num hf-l4-num-inline">{num}</span>
        <p className="hf-l4-o3-lead-label">{item.collectionLabel}</p>
        <p className="hf-l4-o3-lead-title">{item.title}</p>
        {item.excerpt ? (
          <p className="hf-l4-o3-lead-dek">{item.excerpt}</p>
        ) : null}
        <p className="hf-l4-o3-lead-meta">{metaLine(item)}</p>
      </div>
      <div className="hf-l4-o3-lead-visual">
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

function BottomCol({ slotIndex, item, invalid, onClick }: SlotCardProps) {
  const num = slotIndex + 1

  return (
    <button
      type="button"
      className={`hf-l4-o3-col${invalid ? ' invalid' : ''}`}
      onClick={onClick}
    >
      <div className="hf-l4-o3-col-thumb">
        {item?.imageUrl ? (
          <img src={item.imageUrl} alt="" loading="lazy" />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(220,218,214,0.35)' }}>
            <ImgPlaceholder />
          </div>
        )}
        <span className="hf-l4-num">{num}</span>
      </div>
      <div className="hf-l4-o3-col-body">
        {item ? (
          <>
            <p className="hf-l4-o3-col-label">{item.collectionLabel}</p>
            <p className="hf-l4-o3-col-title">{item.title}</p>
            {item.excerpt ? <p className="hf-l4-o3-col-dek">{item.excerpt}</p> : null}
            <p className="hf-l4-o3-col-meta">{metaLine(item)}</p>
          </>
        ) : invalid ? (
          <p className="hf-l4-o3-col-title" style={{ color: 'var(--error)' }}>
            {invalid.reason === 'not_published' ? 'No longer published' : 'Not found'}
          </p>
        ) : (
          <p className="hf-l4-o3-col-title" style={{ color: 'var(--muted)', fontWeight: 400 }}>＋ Add article</p>
        )}
      </div>
    </button>
  )
}

type Props = {
  slots: SlotValue[]
  invalidItemsBySlot: Map<number, HomepageFeaturedInvalidItem>
  onSlotClick: (slotIndex: number) => void
  layout: FeaturedArticlesSlot4Layout
}

export default function FeaturedArticlesLayout4({ slots, invalidItemsBySlot, onSlotClick, layout }: Props) {
  function invalid(i: number) {
    return invalidItemsBySlot.get(i + 1)
  }

  if (layout === 'one-over-three') {
    return (
      <div className="hf-l4-o3">
        <LeadTopRow
          slotIndex={0}
          item={slots[0] ?? null}
          invalid={invalid(0)}
          onClick={() => onSlotClick(0)}
        />
        <div className="hf-l4-o3-divider" aria-hidden />
        <div className="hf-l4-o3-bottom">
          {[1, 2, 3].map((i) => (
            <BottomCol
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

  return (
    <div className="hf-l4">
      <CardHero slotIndex={0} item={slots[0] ?? null} invalid={invalid(0)} onClick={() => onSlotClick(0)} />
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

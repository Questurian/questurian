import {
  CuratedArticleSlotSwapProvider,
  CuratedArticleSlotSwapWrap
} from './CuratedArticleSlotSwap'
import type { SlotValue } from './useHomepageFeaturedSlots'
import type { HomepageFeaturedInvalidItem } from './types'
import type { FeaturedArticlesSlot5Layout } from './pageBlocks'

function ImgPlaceholder() {
  return (
    <svg
      style={{ width: '100%', height: '100%', color: 'var(--muted)' }}
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

function getInvalidMessage(item: HomepageFeaturedInvalidItem): string {
  if (item.reason === 'not_published') return 'No longer published'
  if (item.reason === 'not_found') return 'Item not found'
  return 'Invalid reference'
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

function bylineCaps(item: SlotValue): string {
  if (!item?.authorLabel) return ''
  const a = item.authorLabel
  return a.toLowerCase().startsWith('by ')
    ? a.toUpperCase()
    : `BY ${a.toUpperCase()}`
}

/** Prefer media-set square asset; else OG/wide `imageUrl` (shown in a 1:1 frame). */
function magazineImageUrl(item: SlotValue): string | null {
  if (!item) return null
  return item.imageUrlSquare ?? item.imageUrl
}

type SlotCardProps = {
  slotIndex: number
  item: SlotValue
  invalid: HomepageFeaturedInvalidItem | undefined
  onClick: () => void
}

function MagazineHero({ slotIndex, item, invalid, onClick }: SlotCardProps) {
  const num = slotIndex + 1
  if (!item) {
    return (
      <button
        type="button"
        className={`hf-l5-mag-hero${invalid ? ' invalid' : ''}`}
        onClick={onClick}
      >
        <div className="hf-l5-mag-hero-img hf-l5-mag-hero-img-empty">
          <span className="hf-l5-num">{num}</span>
          {invalid ? (
            <>
              <span style={{ fontSize: '1.4rem' }}>⚠</span>
              <span
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--error)',
                  fontWeight: 600
                }}
              >
                {invalid.reason === 'not_published'
                  ? 'No longer published'
                  : 'Not found'}
              </span>
            </>
          ) : (
            <>
              <span style={{ fontSize: '2rem' }}>＋</span>
              <span>Add lead article</span>
            </>
          )}
        </div>
        <div className="hf-l5-mag-hero-body" />
      </button>
    )
  }

  const heroImg = magazineImageUrl(item)
  return (
    <button type="button" className="hf-l5-mag-hero" onClick={onClick}>
      <div className="hf-l5-mag-hero-img">
        {heroImg ? (
          <img src={heroImg} alt="" loading="lazy" />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(220,218,214,0.35)'
            }}
          >
            <ImgPlaceholder />
          </div>
        )}
        <span className="hf-l5-num">{num}</span>
      </div>
      <div className="hf-l5-mag-hero-body">
        <p className="hf-l5-mag-hero-title">{item.title}</p>
        {item.excerpt ? (
          <p className="hf-l5-mag-hero-dek">{item.excerpt}</p>
        ) : null}
        {bylineCaps(item) ? (
          <p className="hf-l5-mag-hero-byline">{bylineCaps(item)}</p>
        ) : null}
      </div>
    </button>
  )
}

function SidebarRowMedia({ slotIndex, item, invalid, onClick }: SlotCardProps) {
  const num = slotIndex + 1
  const thumbSrc = magazineImageUrl(item)
  return (
    <button
      type="button"
      className={`hf-l5-mag-side hf-l5-mag-side--media${invalid ? ' invalid' : ''}`}
      onClick={onClick}
    >
      <div className="hf-l5-mag-side-thumb">
        {thumbSrc ? (
          <img src={thumbSrc} alt="" loading="lazy" />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(220,218,214,0.35)'
            }}
          >
            <ImgPlaceholder />
          </div>
        )}
        <span className="hf-l5-num">{num}</span>
      </div>
      <div className="hf-l5-mag-side-copy">
        {item ? (
          <>
            <p className="hf-l5-mag-side-label">{item.collectionLabel}</p>
            <p className="hf-l5-mag-side-title">{item.title}</p>
            {bylineCaps(item) ? (
              <p className="hf-l5-mag-side-meta">{bylineCaps(item)}</p>
            ) : null}
          </>
        ) : invalid ? (
          <p className="hf-l5-mag-side-title" style={{ color: 'var(--error)' }}>
            {invalid.reason === 'not_published'
              ? 'No longer published'
              : 'Not found'}
          </p>
        ) : (
          <p
            className="hf-l5-mag-side-title"
            style={{ color: 'var(--muted)', fontWeight: 400 }}
          >
            ＋ Add article
          </p>
        )}
      </div>
    </button>
  )
}

function SidebarRowText({ slotIndex, item, invalid, onClick }: SlotCardProps) {
  const num = slotIndex + 1
  return (
    <button
      type="button"
      className={`hf-l5-mag-side hf-l5-mag-side--text${invalid ? ' invalid' : ''}`}
      onClick={onClick}
    >
      <span className="hf-l5-num hf-l5-num-inline">{num}</span>
      <div className="hf-l5-mag-side-copy">
        {item ? (
          <>
            <p className="hf-l5-mag-side-label">{item.collectionLabel}</p>
            <p className="hf-l5-mag-side-title">{item.title}</p>
            {item.excerpt ? (
              <p className="hf-l5-mag-side-dek">{item.excerpt}</p>
            ) : null}
            <p className="hf-l5-mag-side-meta">
              {bylineCaps(item) ||
                formatShortRelative(item.publishedAt ?? item.updatedAt)}
            </p>
          </>
        ) : invalid ? (
          <p className="hf-l5-mag-side-title" style={{ color: 'var(--error)' }}>
            {invalid.reason === 'not_published'
              ? 'No longer published'
              : 'Not found'}
          </p>
        ) : (
          <p
            className="hf-l5-mag-side-title"
            style={{ color: 'var(--muted)', fontWeight: 400 }}
          >
            ＋ Add article
          </p>
        )}
      </div>
    </button>
  )
}

type GridProps = {
  slots: SlotValue[]
  invalidItemsBySlot: Map<number, HomepageFeaturedInvalidItem>
  onSlotClick: (slotIndex: number) => void
  onReorder: (newSlots: SlotValue[]) => void
}

function CardGrid({
  slots,
  invalidItemsBySlot,
  onSlotClick,
  onReorder
}: GridProps) {
  return (
    <CuratedArticleSlotSwapProvider slots={slots} onReorder={onReorder}>
      <div className="hf-slot-grid">
        {slots.map((item, slotIndex) => {
          const invalidItem = invalidItemsBySlot.get(slotIndex + 1)

          if (!item) {
            return (
              <CuratedArticleSlotSwapWrap
                key={`slot-${slotIndex + 1}`}
                slotIndex={slotIndex}
              >
                <button
                  type="button"
                  className={`hf-slot-card empty${invalidItem ? ' invalid' : ''}`}
                  onClick={() => onSlotClick(slotIndex)}
                >
                  <span className="hf-slot-card-num">{slotIndex + 1}</span>
                  {invalidItem ? (
                    <>
                      <span style={{ fontSize: '1.4rem' }}>⚠</span>
                      <span
                        style={{
                          fontSize: '0.8rem',
                          color: 'var(--danger)',
                          fontWeight: 600
                        }}
                      >
                        {getInvalidMessage(invalidItem)}
                      </span>
                      <span
                        style={{ fontSize: '0.75rem', color: 'var(--muted)' }}
                      >
                        Click to replace
                      </span>
                    </>
                  ) : (
                    <>
                      <span
                        style={{ fontSize: '1.6rem', color: 'var(--muted)' }}
                      >
                        ＋
                      </span>
                      <span
                        style={{ fontSize: '0.8rem', color: 'var(--muted)' }}
                      >
                        Add article
                      </span>
                    </>
                  )}
                </button>
              </CuratedArticleSlotSwapWrap>
            )
          }

          return (
            <CuratedArticleSlotSwapWrap
              key={`slot-${slotIndex + 1}`}
              slotIndex={slotIndex}
            >
              <button
                type="button"
                className="hf-slot-card hf-curated-slot-replace"
                onClick={() => onSlotClick(slotIndex)}
              >
                <div className="hf-slot-card-thumb">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" loading="lazy" />
                  ) : (
                    <ImgPlaceholder />
                  )}
                  <span className="hf-slot-card-num">{slotIndex + 1}</span>
                </div>

                <div className="hf-slot-card-body">
                  <div
                    style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}
                  >
                    <span className="hf-level-tag">{item.collectionLabel}</span>
                    <span className="hf-level-tag">
                      {item.status ?? 'unknown'}
                    </span>
                  </div>
                  <p className="hf-slot-card-title">{item.title}</p>
                </div>
              </button>
            </CuratedArticleSlotSwapWrap>
          )
        })}
      </div>
    </CuratedArticleSlotSwapProvider>
  )
}

type Props = GridProps & {
  layout: FeaturedArticlesSlot5Layout
}

export default function FeaturedArticlesLayout5({
  slots,
  invalidItemsBySlot,
  onSlotClick,
  onReorder,
  layout
}: Props) {
  function invalid(i: number) {
    return invalidItemsBySlot.get(i + 1)
  }

  if (layout === 'card-grid') {
    return (
      <CardGrid
        slots={slots}
        invalidItemsBySlot={invalidItemsBySlot}
        onSlotClick={onSlotClick}
        onReorder={onReorder}
      />
    )
  }

  return (
    <CuratedArticleSlotSwapProvider slots={slots} onReorder={onReorder}>
      <div className="hf-l5-mag">
        <CuratedArticleSlotSwapWrap slotIndex={0}>
          <MagazineHero
            slotIndex={0}
            item={slots[0] ?? null}
            invalid={invalid(0)}
            onClick={() => onSlotClick(0)}
          />
        </CuratedArticleSlotSwapWrap>
        <div className="hf-l5-mag-sidebar">
          <CuratedArticleSlotSwapWrap slotIndex={1}>
            <SidebarRowMedia
              slotIndex={1}
              item={slots[1] ?? null}
              invalid={invalid(1)}
              onClick={() => onSlotClick(1)}
            />
          </CuratedArticleSlotSwapWrap>
          <CuratedArticleSlotSwapWrap slotIndex={2}>
            <SidebarRowText
              slotIndex={2}
              item={slots[2] ?? null}
              invalid={invalid(2)}
              onClick={() => onSlotClick(2)}
            />
          </CuratedArticleSlotSwapWrap>
          <CuratedArticleSlotSwapWrap slotIndex={3}>
            <SidebarRowText
              slotIndex={3}
              item={slots[3] ?? null}
              invalid={invalid(3)}
              onClick={() => onSlotClick(3)}
            />
          </CuratedArticleSlotSwapWrap>
          <CuratedArticleSlotSwapWrap slotIndex={4}>
            <SidebarRowText
              slotIndex={4}
              item={slots[4] ?? null}
              invalid={invalid(4)}
              onClick={() => onSlotClick(4)}
            />
          </CuratedArticleSlotSwapWrap>
        </div>
      </div>
    </CuratedArticleSlotSwapProvider>
  )
}

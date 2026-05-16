import {
  CuratedArticleSlotSwapProvider,
  CuratedArticleSlotSwapWrap
} from './CuratedArticleSlotSwap'
import type { SlotValue } from './useHomepageFeaturedSlots'
import type { HomepageFeaturedInvalidItem } from './types'

function ImgPlaceholder() {
  return (
    <svg
      style={{
        width: '40%',
        height: '40%',
        color: 'var(--muted)',
        opacity: 0.4
      }}
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

function captionFromExcerpt(
  excerpt: string | null,
  maxLen = 96
): string | null {
  if (!excerpt?.trim()) return null
  const t = excerpt.trim()
  if (t.length <= maxLen) return t
  return `${t.slice(0, maxLen - 1)}…`
}

type SlotCardProps = {
  slotIndex: number
  item: SlotValue
  invalid: HomepageFeaturedInvalidItem | undefined
  onClick: () => void
}

function LeftStackCard({ slotIndex, item, invalid, onClick }: SlotCardProps) {
  const num = slotIndex + 1

  if (!item) {
    return (
      <button
        type="button"
        className={`hf-l7-left-card hf-l7-left-card--empty${invalid ? ' invalid' : ''}`}
        onClick={onClick}
      >
        <div className="hf-l7-empty">
          <span className="hf-l7-num hf-l7-num--static">{num}</span>
          {invalid ? (
            <>
              <span style={{ fontSize: '1.2rem' }}>⚠</span>
              <span
                style={{
                  fontSize: '0.8rem',
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
              <span style={{ fontSize: '1.4rem' }}>＋</span>
              <span>Add article</span>
            </>
          )}
        </div>
      </button>
    )
  }

  const cap = captionFromExcerpt(item.excerpt)

  return (
    <button type="button" className="hf-l7-left-card" onClick={onClick}>
      <div className="hf-l7-left-thumb">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" loading="lazy" />
        ) : (
          <div className="hf-l7-thumb-fallback">
            <ImgPlaceholder />
          </div>
        )}
        <span className="hf-l7-num">{num}</span>
      </div>
      {cap ? (
        <p className="hf-l7-credit">{cap}</p>
      ) : (
        <p className="hf-l7-credit hf-l7-credit--muted"> </p>
      )}
      <p className="hf-l7-headline hf-l7-headline--left">{item.title}</p>
      <p className="hf-l7-byline">{item.authorLabel ?? '—'}</p>
    </button>
  )
}

function CenterHero({ slotIndex, item, invalid, onClick }: SlotCardProps) {
  const num = slotIndex + 1

  if (!item) {
    return (
      <button
        type="button"
        className={`hf-l7-hero hf-l7-hero--empty${invalid ? ' invalid' : ''}`}
        onClick={onClick}
      >
        <div className="hf-l7-empty hf-l7-empty--hero">
          <span className="hf-l7-num hf-l7-num--static">{num}</span>
          {invalid ? (
            <>
              <span style={{ fontSize: '1.2rem' }}>⚠</span>
              <span
                style={{
                  fontSize: '0.8rem',
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
              <span style={{ fontSize: '1.6rem' }}>＋</span>
              <span>Add lead article</span>
            </>
          )}
        </div>
      </button>
    )
  }

  const sub = item.excerpt?.trim() ?? null

  return (
    <button type="button" className="hf-l7-hero" onClick={onClick}>
      <div className="hf-l7-hero-thumb">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" loading="lazy" />
        ) : (
          <div className="hf-l7-thumb-fallback">
            <ImgPlaceholder />
          </div>
        )}
        <span className="hf-l7-num">{num}</span>
      </div>
      <div className="hf-l7-hero-copy">
        <p className="hf-l7-headline hf-l7-headline--hero">{item.title}</p>
        {sub ? <p className="hf-l7-dek">{sub}</p> : null}
        <p className="hf-l7-byline hf-l7-byline--center">
          {item.authorLabel ?? '—'}
        </p>
      </div>
    </button>
  )
}

function RightRow({ slotIndex, item, invalid, onClick }: SlotCardProps) {
  const num = slotIndex + 1
  const isFirst = slotIndex === 3

  if (!item) {
    return (
      <button
        type="button"
        className={`hf-l7-side-row${isFirst ? ' hf-l7-side-row--first' : ''}${invalid ? ' invalid' : ''}`}
        onClick={onClick}
      >
        <div className="hf-l7-side-body">
          <span className="hf-l7-num hf-l7-num--inline">{num}</span>
          <p className="hf-l7-headline hf-l7-headline--side hf-l7-headline--placeholder">
            {invalid
              ? invalid.reason === 'not_published'
                ? 'No longer published'
                : 'Not found'
              : '＋ Add article'}
          </p>
        </div>
        <div className="hf-l7-side-thumb hf-l7-side-thumb--empty" />
      </button>
    )
  }

  return (
    <button
      type="button"
      className={`hf-l7-side-row${isFirst ? ' hf-l7-side-row--first' : ''}`}
      onClick={onClick}
    >
      <div className="hf-l7-side-body">
        <span className="hf-l7-num hf-l7-num--inline">{num}</span>
        <p className="hf-l7-headline hf-l7-headline--side">{item.title}</p>
        <p className="hf-l7-byline">{item.authorLabel ?? '—'}</p>
      </div>
      <div className="hf-l7-side-thumb">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" loading="lazy" />
        ) : (
          <div className="hf-l7-thumb-fallback">
            <ImgPlaceholder />
          </div>
        )}
      </div>
    </button>
  )
}

type Props = {
  slots: SlotValue[]
  invalidItemsBySlot: Map<number, HomepageFeaturedInvalidItem>
  onSlotClick: (slotIndex: number) => void
  onReorder: (newSlots: SlotValue[]) => void
}

export default function FeaturedArticlesLayout8({
  slots,
  invalidItemsBySlot,
  onSlotClick,
  onReorder
}: Props) {
  function invalid(slotIndex: number) {
    return invalidItemsBySlot.get(slotIndex + 1)
  }

  return (
    <CuratedArticleSlotSwapProvider slots={slots} onReorder={onReorder}>
      <div className="hf-l7">
        <div className="hf-l7-col hf-l7-col--left">
          <CuratedArticleSlotSwapWrap slotIndex={1}>
            <LeftStackCard
              slotIndex={1}
              item={slots[1] ?? null}
              invalid={invalid(1)}
              onClick={() => onSlotClick(1)}
            />
          </CuratedArticleSlotSwapWrap>
          <CuratedArticleSlotSwapWrap slotIndex={2}>
            <LeftStackCard
              slotIndex={2}
              item={slots[2] ?? null}
              invalid={invalid(2)}
              onClick={() => onSlotClick(2)}
            />
          </CuratedArticleSlotSwapWrap>
        </div>
        <div className="hf-l7-col hf-l7-col--center">
          <CuratedArticleSlotSwapWrap slotIndex={0}>
            <CenterHero
              slotIndex={0}
              item={slots[0] ?? null}
              invalid={invalid(0)}
              onClick={() => onSlotClick(0)}
            />
          </CuratedArticleSlotSwapWrap>
        </div>
        <div className="hf-l7-col hf-l7-col--right">
          {[3, 4, 5, 6, 7].map((i) => (
            <CuratedArticleSlotSwapWrap key={i} slotIndex={i}>
              <RightRow
                slotIndex={i}
                item={slots[i] ?? null}
                invalid={invalid(i)}
                onClick={() => onSlotClick(i)}
              />
            </CuratedArticleSlotSwapWrap>
          ))}
        </div>
      </div>
    </CuratedArticleSlotSwapProvider>
  )
}

import type { HomepageFeaturedInvalidItem } from './types'
import type { SlotValue } from './useHomepageFeaturedSlots'

function formatPublishedLine(iso: string | null): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return new Date(t).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}

function ImgPlaceholder() {
  return (
    <div className="hf-fa-spotlight-placeholder-inner" aria-hidden>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      >
        <rect x="3" y="5" width="18" height="14" rx="1" />
        <circle cx="8.5" cy="10" r="1.5" />
        <path d="M21 17l-6-5-4 4-3-3L3 17" />
      </svg>
    </div>
  )
}

function invalidMessage(item: HomepageFeaturedInvalidItem): string {
  if (item.reason === 'not_published') return 'No longer published'
  if (item.reason === 'not_found') return 'Item not found'
  return 'Invalid reference'
}

type Props = {
  item: SlotValue
  invalidItem: HomepageFeaturedInvalidItem | undefined
  onPick: () => void
  showAuthorAvatar?: boolean
}

export default function FeaturedArticleSpotlightLayout({
  item,
  invalidItem,
  onPick,
  showAuthorAvatar = false
}: Props) {
  const publishedLine = formatPublishedLine(item?.publishedAt ?? null)
  const byline =
    item?.authorLabel && item.authorLabel.trim()
      ? `BY ${item.authorLabel.trim().toUpperCase()}`
      : 'BY EDITORIAL'

  return (
    <div className="hf-fa-spotlight">
      <div className="hf-fa-spotlight-inner">
        <div className="hf-fa-spotlight-copy">
          {!item || invalidItem ? (
            <button
              type="button"
              className="hf-fa-spotlight-empty"
              onClick={onPick}
            >
              <span className="hf-fa-spotlight-empty-title">
                {invalidItem
                  ? invalidMessage(invalidItem)
                  : 'Choose featured article'}
              </span>
              <span className="hf-fa-spotlight-empty-hint">
                {invalidItem
                  ? 'Click to replace this slot.'
                  : showAuthorAvatar
                    ? 'One article or listicle, with the author portrait above the title.'
                    : 'One article or listicle, full-width hero preview.'}
              </span>
            </button>
          ) : (
            <>
              <button
                type="button"
                className={
                  showAuthorAvatar
                    ? 'hf-fa-spotlight-copy-button hf-fa-spotlight-copy-button--creator'
                    : 'hf-fa-spotlight-copy-button'
                }
                onClick={onPick}
              >
                {showAuthorAvatar ? (
                  <span className="hf-fa-spotlight-avatar" aria-hidden={!item.author?.avatar?.url}>
                    {item.author?.avatar?.url ? (
                      <img src={item.author.avatar.url} alt="" />
                    ) : (
                      <span className="hf-fa-spotlight-avatar-placeholder" />
                    )}
                  </span>
                ) : null}
                <h2 className="hf-fa-spotlight-title">{item.title}</h2>
                <p className="hf-fa-spotlight-dek">
                  {item.excerpt?.trim()
                    ? item.excerpt.trim()
                    : 'Add an SEO meta description on the piece to show summary text here.'}
                </p>
                <p className="hf-fa-spotlight-byline">{byline}</p>
                {publishedLine ? (
                  <p className="hf-fa-spotlight-date">{publishedLine}</p>
                ) : null}
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          className="hf-fa-spotlight-media hf-curated-slot-replace"
          aria-label="Replace featured article"
          onClick={onPick}
        >
          {item?.imageUrl ? (
            <img src={item.imageUrl} alt="" loading="lazy" />
          ) : (
            <ImgPlaceholder />
          )}
        </button>
      </div>
    </div>
  )
}

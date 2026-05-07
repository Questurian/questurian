import { Share2, Bookmark, Info } from 'lucide-react'
import type { JSX } from 'react'
import type { ArticleAuthor } from '@/features/articles/types'

function GoogleG(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

type ArticlePageHeaderProps = {
  title: string
  description?: string | null
  featuredImage?: { url: string; alt?: string } | null
  publishedAt?: string
  updatedAt?: string
  author?: ArticleAuthor | null
}

function AuthorBlock({
  author,
  dateLabel,
}: {
  author: ArticleAuthor
  dateLabel?: string | null
}): JSX.Element {
  const displayName = author.publicProfile.displayName
  const imageUrl = author.publicProfile.avatar ?? undefined
  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div className="flex min-w-0 items-center gap-2.5 480:gap-3">
      <div className="relative shrink-0 h-8 w-8 rounded-full bg-foreground overflow-hidden 480:h-9 480:w-9">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={displayName} className="h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-background 480:text-[11px]">
            {initials}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-[3px] text-left">
        <span className="truncate text-foreground text-[12px] font-semibold leading-none 480:text-[13px] sm:text-[14px]">
          {displayName}
        </span>
        <span className="truncate text-foreground/55 text-[11px] leading-none 480:text-[12px]">
          Editorial Team
          {dateLabel ? (
            <span className="hidden 480:inline">
              {' '}
              <span aria-hidden className="text-foreground/30">·</span>{' '}
              {dateLabel}
            </span>
          ) : null}
        </span>
      </div>
    </div>
  )
}

function WavyDivider(): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="mx-auto flex w-full max-w-[44ch] items-center gap-3 text-[var(--maps-listicle-accent)]"
    >
      <span className="h-px flex-1 bg-current" />
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        aria-hidden="true"
        className="shrink-0 fill-current"
      >
        <path
          d="M5 1 L9 5 L5 9 L1 5 Z"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinejoin="round"
          fill="currentColor"
        />
      </svg>
      <span className="h-px flex-1 bg-current" />
    </div>
  )
}

function formatHeaderDate(iso: string | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d)
}

export function ArticlePageHeader({
  title,
  description,
  featuredImage,
  publishedAt,
  updatedAt,
  author,
}: ArticlePageHeaderProps): JSX.Element {
  const dateLabel = (() => {
    const updated = formatHeaderDate(updatedAt)
    if (updated) return `Updated ${updated}`
    const published = formatHeaderDate(publishedAt)
    if (published) return `Published ${published}`
    return null
  })()

  return (
    <div className="px-3 pt-5 pb-0 max-[379px]:px-3 380:px-4 380:pt-6 480:px-5 480:pt-7 550:px-6 550:pt-8 sm:px-8 sm:pt-9 768:px-10 768:pt-10">
      <section
        aria-labelledby="article-magazine-title"
        className="overflow-hidden border border-foreground/15 bg-background px-4 pt-7 pb-7 380:px-6 380:pt-9 380:pb-8 480:px-7 480:pt-10 480:pb-9 sm:px-10 sm:pt-12 sm:pb-10 768:px-12 768:pt-14 768:pb-11 1024:p-0"
      >
        <div className="text-center">
          {featuredImage?.url ? (
            <div className="mx-auto mb-5 sm:mb-6">
              <div className="relative mx-auto h-20 w-20 overflow-hidden rounded-full ring-1 ring-foreground/10 380:h-24 380:w-24 480:h-28 480:w-28 sm:h-32 sm:w-32 768:h-36 768:w-36">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={featuredImage.url}
                  alt={featuredImage.alt ?? ''}
                  className="h-full w-full object-cover"
                  fetchPriority="high"
                  decoding="async"
                />
              </div>
            </div>
          ) : null}

          <h1
            id="article-magazine-title"
            className="font-display font-bold text-foreground text-[26px] leading-[1.18] mb-3 max-[379px]:tracking-tight 380:text-[30px] 380:leading-[1.18] 380:mb-4 480:text-[34px] 550:text-[37px] sm:text-[40px] sm:leading-[1.12] sm:mb-5 768:text-[44px] 768:leading-[1.1]"
          >
            {title}
          </h1>

          {description ? (
            <p className="mx-auto mb-5 max-w-[44ch] font-display text-[14px] leading-[1.4] text-foreground/85 380:text-[15px] 480:text-[16px] sm:mb-6 sm:text-[18px] 768:text-[19px]">
              {description}
            </p>
          ) : null}

          <WavyDivider />
        </div>

        {(author || dateLabel) ? (
          <div className="mt-7 flex items-center justify-between gap-3 border-t border-foreground/10 pt-5 380:mt-8 380:pt-6 480:mt-9 480:pt-6 sm:mt-10 sm:pt-7 768:mt-11 768:pt-8">
            {author ? (
              <AuthorBlock author={author} dateLabel={dateLabel} />
            ) : (
              <span className="text-foreground/60 text-[12px] 480:text-[13px]">
                {dateLabel}
              </span>
            )}

            <div className="flex shrink-0 items-center gap-2.5 480:gap-3">
              <div className="flex shrink-0 items-center gap-3.5 480:gap-4">
                <button
                  type="button"
                  className="text-foreground/50 transition-colors active:text-foreground"
                  aria-label="Share"
                >
                  <Share2 size={18} strokeWidth={1.75} />
                </button>

                <button
                  type="button"
                  className="text-foreground/50 transition-colors active:text-foreground"
                  aria-label="Save"
                >
                  <Bookmark size={18} strokeWidth={1.75} />
                </button>
              </div>

              <button
                type="button"
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-foreground/20 bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground/80 transition-colors active:bg-foreground/5 380:px-3 380:py-2 380:text-[12px] 480:px-3.5 480:text-[13px] sm:px-4 sm:py-2"
              >
                <GoogleG />
                Add Us On Google
              </button>

              <button
                type="button"
                className="text-foreground/40 transition-colors active:text-foreground"
                aria-label="About this article"
              >
                <Info size={18} strokeWidth={1.75} />
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}

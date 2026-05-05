import { Share2, Bookmark } from 'lucide-react'
import type { JSX } from 'react'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

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
  description?: string
  publishedAt: string
}

export function ArticlePageHeader({
  title,
  description,
  publishedAt,
}: ArticlePageHeaderProps): JSX.Element {
  return (
    <div className="px-3 pt-7 pb-5 max-[379px]:px-3 380:px-4 380:pt-8">
      <h1 className="font-display text-foreground text-[22px] leading-[1.2] mb-2.5 max-[379px]:tracking-tight 380:text-[26px] 380:leading-[1.22] 380:mb-3">
        {title}
      </h1>

      {description ? (
        <p className="font-[family-name:var(--font-dm-sans)] text-foreground text-[12px] leading-[1.5] mb-2.5 380:text-[13px] 380:leading-[1.55] 380:mb-3">
          {description}
        </p>
      ) : null}

      <p className="text-foreground/40 text-[11px] mb-4 380:text-[12px] 380:mb-5">
        Updated <time dateTime={publishedAt}>{formatDate(publishedAt)}</time>
      </p>

      <hr className="border-foreground/10 mb-1" />

      <div className="flex items-center justify-between gap-3 py-3">
        <div className="flex items-center gap-5 shrink-0">
          <button
            type="button"
            className="text-foreground/50 active:text-foreground transition-colors"
            aria-label="Share"
          >
            <Share2 size={18} strokeWidth={1.75} />
          </button>

          <button
            type="button"
            className="text-foreground/50 active:text-foreground transition-colors"
            aria-label="Save"
          >
            <Bookmark size={18} strokeWidth={1.75} />
          </button>
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center gap-2.5 shrink-0 border border-foreground/20 rounded-lg px-3 py-1.5 sm:px-4 sm:py-2 text-[12px] sm:text-[13px] font-medium text-foreground/80 bg-background active:bg-foreground/5 transition-colors"
        >
          <GoogleG />
          Add Us On Google
        </button>
      </div>

      <hr className="border-foreground/10 mb-4" />
    </div>
  )
}

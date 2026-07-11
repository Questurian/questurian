import { Share2, Bookmark } from 'lucide-react'
import type { JSX } from 'react'
import { PublicImage } from '@/components/media/PublicImage'
import type { ArticleAuthor } from '@/features/articles/types'
import { AddOnGoogleButton } from '@/features/articles/components/AddOnGoogleButton'
import { AuthorLink } from '@/features/authors/components/AuthorLink'

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
  publishedLine,
}: {
  author: ArticleAuthor
  publishedLine?: string | null
}): JSX.Element {
  const displayName = author.publicProfile.displayName

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[44ch] flex-col items-center gap-1.5 text-center">
      <span className="break-words text-balance font-display text-[13px] font-semibold leading-snug text-foreground 480:text-[14px] sm:text-[15px]">
        By <AuthorLink authorSlug={author.slug} authorId={author.id} className="hover:underline">{displayName}</AuthorLink>
      </span>
      {publishedLine ? (
        <span className="break-words text-balance font-display text-[11px] font-normal leading-snug tracking-[0.02em] text-foreground/50 480:text-[12px]">
          {publishedLine}
        </span>
      ) : null}
    </div>
  )
}

function DoubleRuleRail(): JSX.Element {
  return (
    <div className="box-border min-h-[3px] flex-1 border-x-0 border-b-0 border-t-[3px] border-double border-t-foreground" />
  )
}

function DoubleRuleDiamond(): JSX.Element {
  return (
    <div
      className="box-border size-[14px] shrink-0 rotate-45 border-[3px] border-double border-foreground bg-background"
      aria-hidden
    />
  )
}

function WavyDivider(): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="mx-auto flex w-full max-w-[44ch] items-center gap-1 text-foreground"
    >
      <DoubleRuleRail />
      <DoubleRuleDiamond />
      <DoubleRuleRail />
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
  const publishedLine = (() => {
    const formatted = formatHeaderDate(publishedAt ?? updatedAt)
    return formatted ? `Published ${formatted}` : null
  })()

  return (
    <section
      aria-labelledby="article-magazine-title"
      data-article-header
      className="overflow-hidden rounded-none border-[3px] border-double border-foreground bg-background mx-3 px-4 pt-7 pb-7 380:mx-4 380:px-6 380:pt-9 380:pb-8 480:mx-5 480:px-7 480:pt-10 480:pb-9 550:mx-6 sm:mx-8 sm:px-10 sm:pt-12 sm:pb-10 768:mx-10 768:px-12 768:pt-14 768:pb-11 1024:mx-10 1024:p-0"
    >
      <div className="text-center">
        {featuredImage?.url ? (
          <div className="mx-auto mb-5 sm:mb-6">
            <div className="relative mx-auto h-20 w-20 overflow-hidden rounded-full ring-1 ring-foreground/10 380:h-24 380:w-24 480:h-28 480:w-28 sm:h-32 sm:w-32 768:h-36 768:w-36">
              <PublicImage
                src={featuredImage.url}
                alt={featuredImage.alt ?? ''}
                width={288}
                height={288}
                sizes="(min-width: 768px) 9rem, (min-width: 640px) 8rem, (min-width: 480px) 7rem, (min-width: 380px) 6rem, 5rem"
                className="h-full w-full object-cover"
                priority
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

      {(author || publishedLine) ? (
        <div className="mt-2 flex flex-col gap-4 380:mt-3 380:gap-5 480:mt-4 sm:mt-5 768:mt-6">
          {author ? (
            <AuthorBlock author={author} publishedLine={publishedLine} />
          ) : (
            <span className="mx-auto max-w-[44ch] text-center font-display text-[11px] font-normal leading-snug tracking-[0.02em] text-foreground/50 480:text-[12px]">
              {publishedLine}
            </span>
          )}

          <div className="mx-auto flex w-full max-w-[44ch] flex-col items-center gap-3 380:gap-3.5 sm:gap-4">
            {/*
              "Add Us On Google" CTA. Two variants are available in
              `AddOnGoogleButton`:
                - variant="google"    -> brand-faithful Material-style button
                                         (Roboto, white surface, 4px corners).
                                         Use this when we want the action to
                                         read as a first-party Google integration.
                - variant="editorial" -> magazine-style pill button (Playfair,
                                         fully rounded, foreground border) that
                                         matches the rest of this header's
                                         editorial typography. Swap to this
                                         variant if the Google styling feels
                                         too utilitarian on heavily editorial
                                         surfaces.
            */}
            <AddOnGoogleButton variant="google" />

            <div className="flex items-center gap-3 text-foreground/55 380:gap-4">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 font-display text-[10px] uppercase leading-none tracking-[0.18em] transition-colors hover:text-foreground active:text-foreground 380:text-[11px]"
                aria-label="Share article"
              >
                <Share2 size={13} strokeWidth={1.75} aria-hidden="true" />
                Share
              </button>

              <span
                aria-hidden="true"
                className="size-[3px] rounded-full bg-foreground/30"
              />

              <button
                type="button"
                className="inline-flex items-center gap-1.5 font-display text-[10px] uppercase leading-none tracking-[0.18em] transition-colors hover:text-foreground active:text-foreground 380:text-[11px]"
                aria-label="Save article"
              >
                <Bookmark size={13} strokeWidth={1.75} aria-hidden="true" />
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

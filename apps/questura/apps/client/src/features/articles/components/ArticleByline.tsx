import type { JSX } from 'react'

import { ShimmerImage } from '@/components/media/ShimmerImage'
import { AuthorLink } from '@/features/authors/components/AuthorLink'
import {
  AUTHOR_SOCIAL_PLATFORMS,
  AuthorSocialIconLink,
} from '@/features/authors/components/AuthorSocialLinks'
import type { ArticleAuthor } from '@/features/articles/types'

type ArticleBylineProps = {
  author: ArticleAuthor
  dateLine?: string | null
  variant: 'framed' | 'standard'
}

export function hasFeaturedArticleByline(author: ArticleAuthor): boolean {
  return Boolean(author.articleByline?.avatar || author.articleByline?.links.length)
}

export function FeaturedBylineLinks({
  author,
  className = 'flex items-center gap-3',
  linkClassName = 'text-accent transition-colors hover:text-foreground',
  iconClassName = 'size-4',
}: {
  author: ArticleAuthor
  className?: string
  linkClassName?: string
  iconClassName?: string
}): JSX.Element | null {
  const links = (author.articleByline?.links ?? []).flatMap((link) => {
    const platform = AUTHOR_SOCIAL_PLATFORMS.find(
      (candidate) => candidate.linkKey === link.platform,
    )
    return platform ? [{ ...link, platform }] : []
  })

  if (links.length === 0) return null

  return (
    <div className={className}>
      {links.map(({ platform, url }) => (
        <AuthorSocialIconLink
          key={platform.key}
          platform={platform}
          href={url}
          authorName={author.displayName}
          className={linkClassName}
          iconClassName={iconClassName}
        />
      ))}
    </div>
  )
}

function Avatar({ author }: { author: ArticleAuthor }): JSX.Element | null {
  const avatar = author.articleByline?.avatar
  if (!avatar?.url) return null

  return (
    <div className="size-14 shrink-0 overflow-hidden rounded-full ring-1 ring-foreground/12 480:size-16">
      <ShimmerImage
        src={avatar.url}
        alt={avatar.alt ?? `${author.displayName} profile photo`}
        width={128}
        height={128}
        sizes="64px"
        className="h-full w-full object-cover"
        wrapperClassName="h-full w-full"
      />
    </div>
  )
}

export function ArticleByline({ author, dateLine, variant }: ArticleBylineProps): JSX.Element {
  const isFeatured = hasFeaturedArticleByline(author)

  // Standard article headers stay the compact text byline even when the author
  // opted into an avatar/social banner — that banner lives at the article foot.
  if (variant === 'standard') {
    return (
      <p className="font-display text-[15px] italic leading-snug text-foreground 1024:text-right">
        By{' '}
        <AuthorLink authorSlug={author.slug} authorId={author.id} className="hover:underline">
          {author.displayName}
        </AuthorLink>
        {dateLine ? ` • ${dateLine}` : null}
      </p>
    )
  }

  if (!isFeatured) {
    return (
      <div className="mx-auto flex w-full min-w-0 max-w-[44ch] flex-col items-center gap-1.5 text-center">
        <span className="break-words text-balance font-display text-[13px] font-semibold leading-snug text-foreground 480:text-[14px] sm:text-[15px]">
          By{' '}
          <AuthorLink authorSlug={author.slug} authorId={author.id} className="hover:underline">
            {author.displayName}
          </AuthorLink>
        </span>
        {dateLine ? (
          <span className="break-words text-balance font-display text-[11px] font-normal leading-snug tracking-[0.02em] text-foreground/50 480:text-[12px]">
            {dateLine}
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <div className="mx-auto flex items-center justify-center gap-4 py-1 sm:gap-5 sm:py-2">
      <Avatar author={author} />
      <div className="flex min-w-0 flex-col items-start text-left">
        <span className="break-words font-display text-[15px] font-semibold leading-snug text-foreground sm:text-[16px]">
          By{' '}
          <AuthorLink authorSlug={author.slug} authorId={author.id} className="hover:underline">
            {author.displayName}
          </AuthorLink>
        </span>
        {dateLine ? (
          <span className="mt-1 font-display text-[12px] leading-snug tracking-[0.02em] text-foreground/50 sm:text-[13px]">
            {dateLine}
          </span>
        ) : null}
        <FeaturedBylineLinks
          author={author}
          className="mt-2.5 flex items-center justify-start gap-3.5"
          iconClassName="size-4 480:size-[18px]"
        />
      </div>
    </div>
  )
}

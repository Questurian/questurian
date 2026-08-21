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

function FeaturedLinks({ author }: { author: ArticleAuthor }): JSX.Element | null {
  const links = (author.articleByline?.links ?? []).flatMap((link) => {
    const platform = AUTHOR_SOCIAL_PLATFORMS.find(
      (candidate) => candidate.linkKey === link.platform,
    )
    return platform ? [{ ...link, platform }] : []
  })

  if (links.length === 0) return null

  return (
    <div className="flex items-center gap-3">
      {links.map(({ platform, url }) => (
        <AuthorSocialIconLink
          key={platform.key}
          platform={platform}
          href={url}
          authorName={author.displayName}
          className="text-accent transition-colors hover:text-foreground"
          iconClassName="size-4"
        />
      ))}
    </div>
  )
}

function Avatar({ author }: { author: ArticleAuthor }): JSX.Element | null {
  const avatar = author.articleByline?.avatar
  if (!avatar?.url) return null

  return (
    <div className="size-11 shrink-0 overflow-hidden rounded-full ring-1 ring-foreground/15 480:size-12">
      <ShimmerImage
        src={avatar.url}
        alt={avatar.alt ?? `${author.displayName} profile photo`}
        width={96}
        height={96}
        sizes="48px"
        className="h-full w-full object-cover"
        wrapperClassName="h-full w-full"
      />
    </div>
  )
}

export function ArticleByline({ author, dateLine, variant }: ArticleBylineProps): JSX.Element {
  const isFeatured = Boolean(author.articleByline?.avatar || author.articleByline?.links.length)

  if (!isFeatured && variant === 'standard') {
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

  const alignment = variant === 'framed' ? 'items-center text-center' : 'items-start text-left'
  const justification = variant === 'framed' ? 'justify-center' : ''

  return (
    <div className={`flex min-w-0 gap-3 ${alignment} ${justification}`}>
      <Avatar author={author} />
      <div className={`flex min-w-0 flex-col gap-1 ${alignment}`}>
        <span className="break-words font-display text-[14px] font-semibold leading-snug text-foreground sm:text-[15px]">
          By{' '}
          <AuthorLink authorSlug={author.slug} authorId={author.id} className="hover:underline">
            {author.displayName}
          </AuthorLink>
        </span>
        {dateLine ? (
          <span className="font-display text-[11px] leading-snug tracking-[0.02em] text-foreground/50 480:text-[12px]">
            {dateLine}
          </span>
        ) : null}
        <FeaturedLinks author={author} />
      </div>
    </div>
  )
}

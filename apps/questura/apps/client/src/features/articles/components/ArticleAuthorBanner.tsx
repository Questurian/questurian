import type { JSX } from 'react'

import { AuthorAvatar } from '@/features/authors/components/AuthorAvatar'
import { AuthorLink } from '@/features/authors/components/AuthorLink'
import { authorPath } from '@/features/authors/lib/authorPath'
import {
  EditorialLabelRule,
  editorialKickerClass,
} from '@/features/articles/components/EditorialRule'
import type { ArticleAuthor } from '@/features/articles/types'
import {
  FeaturedBylineLinks,
  hasFeaturedArticleByline,
} from '@/features/articles/components/ArticleByline'

export function ArticleAuthorBanner({
  author,
}: {
  author: ArticleAuthor
}): JSX.Element | null {
  if (!hasFeaturedArticleByline(author)) return null

  const name = author.displayName
  const href = authorPath({ slug: author.slug, id: author.id })
  const avatar = author.avatar ?? author.articleByline?.avatar ?? null

  return (
    <footer>
      <EditorialLabelRule>Written by</EditorialLabelRule>

      <div className="mt-5 flex items-center gap-4 sm:gap-5">
        <AuthorAvatar avatar={avatar} name={name} size="article" />

        <div className="min-w-0">
          <p className={`${editorialKickerClass} text-accent`}>Questurian contributor</p>

          <h2 className="mt-1.5 font-display text-[20px] font-medium leading-[1.12] tracking-[-0.02em] text-foreground sm:text-[22px]">
            <AuthorLink authorSlug={author.slug} authorId={author.id} className="hover:underline">
              {name}
            </AuthorLink>
          </h2>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <FeaturedBylineLinks
              author={author}
              className="flex items-center gap-3.5"
              linkClassName="text-foreground/60 transition-colors hover:text-foreground"
              iconClassName="size-[18px]"
            />

            {href ? (
              <AuthorLink
                authorSlug={author.slug}
                authorId={author.id}
                className="font-[family-name:var(--font-dm-sans)] text-[13px] font-semibold text-accent hover:underline"
              >
                More from {name}
              </AuthorLink>
            ) : null}
          </div>
        </div>
      </div>
    </footer>
  )
}

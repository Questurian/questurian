import type { ReactNode } from 'react'

import type {
  FeaturedArticleTeaser,
  FeaturedArticlesBlock,
  HomepageBlockLayoutProps,
} from '../../../types'

function getArticleTypeLabel(article: FeaturedArticleTeaser): string {
  return article.articleType ?? article.category?.name ?? 'Article'
}

function getAuthorLabel(article: FeaturedArticleTeaser): string {
  const authorName = article.author?.name
  const fullName = [article.author?.firstName, article.author?.lastName].filter(Boolean).join(' ')

  return authorName || fullName || 'Questurian'
}

export function FeaturedArticlesSevenArticlePreview({
  block,
}: HomepageBlockLayoutProps<FeaturedArticlesBlock>): ReactNode {
  const article = block.items[0]

  if (!article) {
    return null
  }

  const imageUrl = article.imageUrlSquare ?? article.imageUrl
  const articleTypeLabel = getArticleTypeLabel(article)
  const excerpt = article.excerpt ?? 'Meta description not set'
  const authorLabel = getAuthorLabel(article)

  return (
    <section className="grid gap-6 px-4 py-8 380:px-0 768:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] 768:gap-0 768:py-0">
      <div className="relative min-h-72 bg-[#2d4a3e] 768:min-h-[30rem]">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={article.title}
            className="h-full min-h-72 w-full object-cover 768:min-h-[30rem]"
          />
        ) : null}
      </div>

      <div className="flex min-h-72 flex-col justify-center py-2 380:px-5 768:min-h-[30rem] 768:px-10 1024:px-16">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c65d3b]">
          {articleTypeLabel}
        </p>

        <h2 className="mt-4 max-w-2xl font-display text-4xl font-semibold leading-[0.95] text-[#1a1a1a] 768:text-6xl">
          {article.title}
        </h2>

        <p className="mt-5 max-w-xl text-base leading-7 text-[#2c2c2c]/75 768:text-lg">
          {excerpt}
        </p>

        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.16em] text-[#2d4a3e]">
          {authorLabel}
        </p>
      </div>
    </section>
  )
}

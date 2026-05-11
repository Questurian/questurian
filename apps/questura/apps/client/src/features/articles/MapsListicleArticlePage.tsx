import type { JSX } from 'react'
import { ArticlePageHeader } from '@/features/articles/components/ArticlePageHeader'
import { ListicleSeparator } from '@/features/articles/components/ListicleSeparator'
import { ListicleVenueEntry } from '@/features/articles/components/ListicleVenueEntry'
import type { MapsListicleArticle } from '@/features/articles/types/mapsListicle'

type MapsListicleArticlePageProps = {
  article: MapsListicleArticle
}

export function MapsListicleArticlePage({
  article,
}: MapsListicleArticlePageProps): JSX.Element {
  const featuredImage = article.header?.featuredImage
  const introRaw = article.header?.intro
  const introHtml = typeof introRaw === 'string' ? introRaw : null
  const description = article.seoSection?.metaDescription

  const items = article.items ?? []

  return (
    <article className="maps-listicle-article min-h-screen bg-background sm:max-w-[600px] sm:mx-auto 1024:max-w-none 1024:mx-0">
      <ArticlePageHeader
        title={article.title}
        description={description}
        featuredImage={
          featuredImage?.url
            ? { url: featuredImage.url, alt: featuredImage.alt_text }
            : null
        }
        publishedAt={article.publishedAt}
        updatedAt={article.updatedAt}
        author={article.author}
      />

      {introHtml ? (
        <div className="px-3 pt-6 pb-2 380:px-4 380:pt-8 380:pb-3 480:px-5 480:pt-10 480:pb-4 550:px-6 sm:px-8 sm:pt-10 sm:pb-5 768:px-10">
          <div
            className="article-prose maps-listicle-intro max-w-none"
            dangerouslySetInnerHTML={{ __html: introHtml }}
          />
        </div>
      ) : null}

      <ListicleSeparator />

      <div className="px-3 pb-20 pt-4 380:px-4 380:pt-6 480:px-5 480:pt-8 480:pb-24 550:px-6 550:pt-10 sm:px-8 sm:pt-8 sm:pb-32 768:px-10">
        <ol className="m-0 list-none p-0">
          {items.map((row, i) => (
            <ListicleVenueEntry key={row.id} row={row} index={i} />
          ))}
        </ol>
      </div>
    </article>
  )
}

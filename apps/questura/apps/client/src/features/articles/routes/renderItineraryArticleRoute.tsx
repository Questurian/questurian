import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/seo/JsonLd'
import { buildArticleBreadcrumbJsonLd } from '@/features/articles/lib/articleBreadcrumbJsonLd'
import { articleJsonLdNodes } from '@/features/articles/lib/paywallJsonLd'
import { isLocked } from '@/features/articles/lib/gate'
import { articleHrefForScope } from '@/features/articles/lib/articleScope'
import { fetchArticle } from '@/features/articles/lib/fetchArticle'
import { fetchRelatedMapsArticles } from '@/features/articles/lib/fetchRelatedMapsArticles'
import { ItineraryArticleLayout } from '@/features/articles/layouts/ItineraryArticleLayout'
import { isListicleItineraryArticle } from '@/features/articles/types/itineraryListicle'
import type { ArticleScope } from '@/features/articles/lib/articleScope'

type RenderItineraryArticleRouteParams = {
  scope: Extract<ArticleScope, { kind: 'city' }>
  slug: string
  lang?: string
}

export async function renderItineraryArticleRoute({
  scope,
  slug,
  lang,
}: RenderItineraryArticleRouteParams) {
  const [article, relatedArticles] = await Promise.all([
    fetchArticle({ scope, type: 'itineraries', slug, lang }),
    fetchRelatedMapsArticles(scope.country, scope.city, slug),
  ])

  if (!article || !isListicleItineraryArticle(article)) {
    notFound()
  }

  const path = articleHrefForScope(scope, 'itineraries', slug)

  return (
    <>
      {articleJsonLdNodes({
        locked: isLocked(article),
        headline: article.title,
        existing: article.seoSection?.structuredData,
      }).map((node, index) => (
        <JsonLd key={index} data={node} />
      ))}
      <JsonLd data={buildArticleBreadcrumbJsonLd({ path, articleTitle: article.title })} />
      <ItineraryArticleLayout
        article={article}
        relatedArticles={relatedArticles}
        country={scope.country}
        city={scope.city}
        path={path}
      />
    </>
  )
}

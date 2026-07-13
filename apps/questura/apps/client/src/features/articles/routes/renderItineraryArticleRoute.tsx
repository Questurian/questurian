import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/seo/JsonLd'
import { buildArticleBreadcrumbJsonLd } from '@/features/articles/lib/articleBreadcrumbJsonLd'
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
      <JsonLd data={article.seoSection?.structuredData} />
      <JsonLd data={buildArticleBreadcrumbJsonLd({ path, articleTitle: article.title })} />
      <ItineraryArticleLayout
        article={article}
        relatedArticles={relatedArticles}
        country={scope.country}
        city={scope.city}
      />
    </>
  )
}

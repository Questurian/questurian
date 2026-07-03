import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/seo/JsonLd'
import { buildArticleBreadcrumbJsonLd } from '@/features/articles/lib/articleBreadcrumbJsonLd'
import { articleHrefForScope } from '@/features/articles/lib/articleScope'
import { fetchArticle } from '@/features/articles/lib/fetchArticle'
import { fetchRelatedMapsArticles } from '@/features/articles/lib/fetchRelatedMapsArticles'
import { MapsArticleLayout } from '@/features/articles/layouts/MapsArticleLayout'
import { isMapsListicleArticle } from '@/features/articles/types/mapsListicle'
import type { ArticleScope } from '@/features/articles/lib/articleScope'

type RenderMapsArticleRouteParams = {
  scope: Extract<ArticleScope, { kind: 'city' }>
  slug: string
  lang?: string
}

export async function renderMapsArticleRoute({
  scope,
  slug,
  lang,
}: RenderMapsArticleRouteParams) {
  const [article, relatedArticles] = await Promise.all([
    fetchArticle({ scope, type: 'maps', slug, lang }),
    fetchRelatedMapsArticles(scope.country, scope.city, slug),
  ])

  if (!article || !isMapsListicleArticle(article)) {
    notFound()
  }

  const path = articleHrefForScope(scope, 'maps', slug)

  return (
    <>
      <JsonLd data={article.seoSection?.structuredData} />
      <JsonLd data={buildArticleBreadcrumbJsonLd({ path, articleTitle: article.title })} />
      <MapsArticleLayout
        article={article}
        relatedArticles={relatedArticles}
        country={scope.country}
        city={scope.city}
      />
    </>
  )
}

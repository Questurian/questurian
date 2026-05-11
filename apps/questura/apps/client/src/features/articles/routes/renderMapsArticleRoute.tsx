import { notFound } from 'next/navigation'
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

  return (
    <MapsArticleLayout
      article={article}
      relatedArticles={relatedArticles}
      country={scope.country}
      city={scope.city}
    />
  )
}

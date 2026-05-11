import { notFound } from 'next/navigation'
import { ItineraryListicleArticlePage } from '@/features/articles/ItineraryListicleArticlePage'
import { fetchArticle } from '@/features/articles/lib/fetchArticle'
import { fetchRelatedMapsArticles } from '@/features/articles/lib/fetchRelatedMapsArticles'
import { ListicleArticleLayout } from '@/features/articles/layouts/ListicleArticleLayout'
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

  return (
    <ListicleArticleLayout
      relatedArticles={relatedArticles}
      country={scope.country}
      city={scope.city}
    >
      <ItineraryListicleArticlePage article={article} />
    </ListicleArticleLayout>
  )
}

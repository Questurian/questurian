import { notFound } from 'next/navigation'
import { fetchArticle } from '@/features/articles/lib/fetchArticle'
import { fetchRelatedMapsArticles } from '@/features/articles/lib/fetchRelatedMapsArticles'
import { MapsArticleLayout } from '@/features/articles/layouts/MapsArticleLayout'
import { isMapsListicleArticle } from '@/features/articles/types/mapsListicle'

type RenderMapsArticleRouteParams = {
  country: string
  city?: string | null
  slug: string
}

export async function renderMapsArticleRoute({
  country,
  city,
  slug,
}: RenderMapsArticleRouteParams) {
  const [article, relatedArticles] = await Promise.all([
    fetchArticle({ country, city, type: 'maps', slug }),
    fetchRelatedMapsArticles(country, city, slug),
  ])

  if (!article || !isMapsListicleArticle(article)) {
    notFound()
  }

  return (
    <MapsArticleLayout
      article={article}
      relatedArticles={relatedArticles}
      country={country}
      city={city}
    />
  )
}

import { notFound } from 'next/navigation'
import { ItineraryListicleArticlePage } from '@/features/articles/ItineraryListicleArticlePage'
import { fetchArticle } from '@/features/articles/lib/fetchArticle'
import { fetchRelatedMapsArticles } from '@/features/articles/lib/fetchRelatedMapsArticles'
import { ListicleArticleLayout } from '@/features/articles/layouts/ListicleArticleLayout'
import { isListicleItineraryArticle } from '@/features/articles/types/itineraryListicle'

type RenderItineraryArticleRouteParams = {
  country: string
  city?: string | null
  slug: string
}

export async function renderItineraryArticleRoute({
  country,
  city,
  slug,
}: RenderItineraryArticleRouteParams) {
  const [article, relatedArticles] = await Promise.all([
    fetchArticle({ country, city, type: 'itinerary', slug }),
    fetchRelatedMapsArticles(country, city, slug),
  ])

  if (!article || !isListicleItineraryArticle(article)) {
    notFound()
  }

  return (
    <ListicleArticleLayout
      relatedArticles={relatedArticles}
      country={country}
      city={city}
    >
      <ItineraryListicleArticlePage article={article} />
    </ListicleArticleLayout>
  )
}

import { renderStandardArticleRoute } from '@/features/articles/routes/renderStandardArticleRoute'
import { renderMapsArticleRoute } from '@/features/articles/routes/renderMapsArticleRoute'
import { renderItineraryArticleRoute } from '@/features/articles/routes/renderItineraryArticleRoute'
import type { StandardArticleRouteType } from '@/features/articles/routes/articleRouteTypes'
import { STANDARD_ARTICLE_ROUTE_TYPES } from '@/features/articles/routes/articleRouteTypes'

type Props = {
  params: Promise<{ country: string; city: string; slug: string }>
}

function isStandardArticleRouteType(value: string): value is StandardArticleRouteType {
  return STANDARD_ARTICLE_ROUTE_TYPES.includes(value as StandardArticleRouteType)
}

export default async function ArticlePageRoute({ params }: Props) {
  const { country, city, slug } = await params

  if (city === 'maps') {
    return renderMapsArticleRoute({ country, slug })
  }

  if (city === 'itinerary') {
    return renderItineraryArticleRoute({ country, slug })
  }

  if (isStandardArticleRouteType(city)) {
    return renderStandardArticleRoute({ country, slug, type: city })
  }

  return renderStandardArticleRoute({ country, city, slug })
}

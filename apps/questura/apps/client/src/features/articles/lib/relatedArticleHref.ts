import type { RelatedMapsArticleTeaser } from '@/features/articles/lib/fetchRelatedMapsArticles'

/**
 * The related-articles API reports `routeType` in the singular ('itinerary'),
 * but the route segment is plural ('/itineraries/'). Pasting routeType
 * straight into the path 404s, so every surface that links a related article
 * goes through here.
 */
const ROUTE_SEGMENTS: Record<RelatedMapsArticleTeaser['routeType'], string> = {
  maps: 'maps',
  itinerary: 'itineraries',
}

export function relatedArticleHref(
  article: RelatedMapsArticleTeaser,
  country: string,
  city?: string | null,
): string {
  const segment = ROUTE_SEGMENTS[article.routeType] ?? article.routeType
  return city
    ? `/${country}/${city}/${segment}/${article.slug}`
    : `/${country}/${segment}/${article.slug}`
}

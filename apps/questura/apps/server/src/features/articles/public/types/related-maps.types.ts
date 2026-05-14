export type RelatedMapsArticleRouteType = 'maps' | 'itinerary'

export type RelatedMapsArticleTeaser = {
  id: string | number
  title: string
  slug: string
  routeType: RelatedMapsArticleRouteType
  header?: {
    featuredImage?: {
      url: string
      alt_text?: string
    } | null
  } | null
}

export type FetchRelatedMapsArticlesParams = {
  country: string
  city?: string | null
  currentSlug?: string | null
}

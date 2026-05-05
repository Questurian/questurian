export const ARTICLE_ROUTE_TYPES = [
  'maps',
  'itinerary',
  'guide',
  'food',
  'neighborhoods',
] as const

export type ArticleRouteType = (typeof ARTICLE_ROUTE_TYPES)[number]

/** Key used to pick a shell layout component; `default` is a single-segment article URL. */
export type ArticleLayoutKey = 'default' | ArticleRouteType

export function parseArticlePath(segments: string[]): {
  type: ArticleRouteType | null
  slug: string
} | null {
  if (segments.length === 1) {
    return { type: null, slug: segments[0] }
  }

  if (
    segments.length === 2 &&
    ARTICLE_ROUTE_TYPES.includes(segments[0] as ArticleRouteType)
  ) {
    return { type: segments[0] as ArticleRouteType, slug: segments[1] }
  }

  return null
}

export function articleLayoutKeyFromRouteType(
  type: ArticleRouteType | null
): ArticleLayoutKey {
  return type ?? 'default'
}

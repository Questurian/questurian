export const STANDARD_ARTICLE_ROUTE_TYPES = [
  'guide',
  'food',
  'neighborhoods',
] as const

export type StandardArticleRouteType =
  (typeof STANDARD_ARTICLE_ROUTE_TYPES)[number]

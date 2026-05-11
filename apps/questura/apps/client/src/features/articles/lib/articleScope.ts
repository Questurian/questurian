export type ArticleScope =
  | { kind: 'global' }
  | { kind: 'country'; country: string }
  | { kind: 'city'; country: string; city: string }

export type ArticleTypeKey = 'articles' | 'maps' | 'itineraries'

export function articleHrefForScope(
  scope: ArticleScope,
  type: ArticleTypeKey,
  slug: string,
): string {
  if (scope.kind === 'global') return `/${type}/${slug}`
  if (scope.kind === 'country') return `/${scope.country}/${type}/${slug}`
  return `/${scope.country}/${scope.city}/${type}/${slug}`
}

export function indexHrefForScope(
  scope: ArticleScope,
  type: ArticleTypeKey,
  page = 1,
): string {
  const base =
    scope.kind === 'global'
      ? `/${type}`
      : scope.kind === 'country'
        ? `/${scope.country}/${type}`
        : `/${scope.country}/${scope.city}/${type}`
  return page <= 1 ? base : `${base}/page/${page}`
}

export function hubHrefForScope(scope: ArticleScope): string {
  if (scope.kind === 'global') return '/'
  if (scope.kind === 'country') return `/${scope.country}`
  return `/${scope.country}/${scope.city}`
}

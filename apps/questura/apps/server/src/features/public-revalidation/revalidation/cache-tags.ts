import type { ArticleScope, ArticleTypeKey } from './types'

export function tagPart(value: string | number | null | undefined): string {
  return encodeURIComponent(String(value ?? 'none').trim().toLowerCase())
}

export function scopeTag(scope: ArticleScope): string {
  if (scope.kind === 'city') return `city:${tagPart(scope.country)}:${tagPart(scope.city)}`
  if (scope.kind === 'country') return `country:${tagPart(scope.country)}`
  return 'global'
}

export const publicCacheTags = {
  sitemap: () => 'sitemap',
  countryCities: (country: string) => `country-cities:${tagPart(country)}`,
  locationHomepage: (country: string, city: string) =>
    `location-homepage:${tagPart(country)}:${tagPart(city)}`,
  article: (scope: ArticleScope, type: ArticleTypeKey, slug: string, lang: string) =>
    `article:${scopeTag(scope)}:${tagPart(type)}:${tagPart(slug)}:${tagPart(lang)}`,
  articlePath: (path: string, lang: string) => `article-path:${tagPart(path)}:${tagPart(lang)}`,
  articleRedirect: (path: string) => `article-redirect:${tagPart(path)}`,
  articleIndexScope: (scope: ArticleScope, type: ArticleTypeKey, lang: string) =>
    `article-index:${scopeTag(scope)}:${tagPart(type)}:${tagPart(lang)}`,
  relatedMapsScope: (country: string, city: string | null) =>
    `related-maps:${tagPart(country)}:${tagPart(city)}`,
}

export function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}

import type { Where } from 'payload'
import type { ArticleCollectionSlug } from './serializeArticleBlocks'

export type ArticleScope =
  | { kind: 'global' }
  | { kind: 'country'; country: string }
  | { kind: 'city'; country: string; city: string }

export type ArticleTypeKey = 'articles' | 'maps' | 'itineraries'

export const TYPE_TO_COLLECTION: Record<ArticleTypeKey, ArticleCollectionSlug> = {
  articles: 'articles',
  maps: 'single-type-listicles',
  itineraries: 'listicle-itineraries',
}

export function isArticleTypeKey(value: unknown): value is ArticleTypeKey {
  return value === 'articles' || value === 'maps' || value === 'itineraries'
}

export function isArticleScopeKind(value: unknown): value is ArticleScope['kind'] {
  return value === 'global' || value === 'country' || value === 'city'
}

export function buildScopeWhereCascade(scope: ArticleScope): Where | null {
  if (scope.kind === 'global') return null
  const base = scope.kind === 'country' ? scope.country : `${scope.country}|${scope.city}`
  return {
    or: [
      { location: { equals: base } },
      { location: { like: `${base}|%` } },
    ],
  }
}

export function articleHrefForScope(
  scope: ArticleScope,
  type: ArticleTypeKey,
  slug: string,
): string {
  const typeSegment = type
  if (scope.kind === 'global') return `/${typeSegment}/${slug}`
  if (scope.kind === 'country') return `/${scope.country}/${typeSegment}/${slug}`
  return `/${scope.country}/${scope.city}/${typeSegment}/${slug}`
}

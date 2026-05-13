import type { CuratedBlockType } from './types'

export const CURATED_BLOCK_TYPES: readonly CuratedBlockType[] = [
  'featured-article',
  'featured-article-carousel',
  'featured-articles',
  'article-grid',
  'location-grid',
  'questurian-maps',
  'hotel-grid',
  'tour-grid',
  'where-to-eat-drink',
  'things-to-do-listicles',
  'things-to-do-attractions',
  'newsletter-signup',
  'article-list',
] as const

export const PUBLIC_ARTICLE_BLOCK_TYPES: ReadonlySet<string> = new Set([
  'featured-article',
  'featured-article-carousel',
  'featured-articles',
  'article-grid',
  'questurian-maps',
  'where-to-eat-drink',
  'things-to-do-listicles',
  'article-list',
])

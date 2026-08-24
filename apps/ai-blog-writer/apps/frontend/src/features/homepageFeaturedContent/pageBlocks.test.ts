import { describe, expect, it } from 'vitest'

import {
  ARTICLE_CURATED_HOMEPAGE_BLOCK_TYPES,
  CONVERT_EMPTY_FEATURED_ARTICLES_TO_BLOCK_TYPES,
  HOMEPAGE_PAGE_BLOCK_CONFIG,
  HOMEPAGE_PAGE_BLOCK_TYPES,
  isArticleCuratedHomepageBlock,
  isCuratedHomepageBlock,
  isValidHomepageBlockSlotCount,
  type PageBlockResponse
} from './pageBlocks'

describe('pageBlocks registry', () => {
  it('derives add-block order and config from one definition map', () => {
    expect(HOMEPAGE_PAGE_BLOCK_TYPES).toEqual([
      'featured-articles',
      'editorial-feature',
      'author-feature',
      'hotel-grid',
      'tour-grid',
      'article-grid',
      'article-list',
      'featured-article',
      'featured-creator-article',
      'featured-article-carousel',
      'location-grid',
      'where-to-eat-drink',
      'things-to-do-attractions',
      'things-to-do-listicles',
      'questurian-maps',
      'newsletter-signup'
    ])
    expect(Object.keys(HOMEPAGE_PAGE_BLOCK_CONFIG).sort()).toEqual(
      [...HOMEPAGE_PAGE_BLOCK_TYPES].sort()
    )
  })

  it('derives convert targets and article block types', () => {
    expect(CONVERT_EMPTY_FEATURED_ARTICLES_TO_BLOCK_TYPES).toEqual([
      'featured-article',
      'featured-creator-article',
      'featured-article-carousel',
      'editorial-feature',
      'author-feature',
      'article-grid',
      'location-grid',
      'questurian-maps',
      'hotel-grid',
      'tour-grid',
      'where-to-eat-drink',
      'things-to-do-listicles',
      'things-to-do-attractions',
      'newsletter-signup',
      'article-list'
    ])
    expect(ARTICLE_CURATED_HOMEPAGE_BLOCK_TYPES).toEqual([
      'featured-article',
      'featured-creator-article',
      'featured-article-carousel',
      'featured-articles',
      'editorial-feature',
      'author-feature',
      'article-grid',
      'questurian-maps',
      'where-to-eat-drink',
      'things-to-do-listicles',
      'article-list'
    ])
  })

  it('uses derived guards', () => {
    expect(
      isCuratedHomepageBlock({ blockType: 'hotel-grid' } as PageBlockResponse)
    ).toBe(true)
    expect(
      isCuratedHomepageBlock({ blockType: 'unknown' } as PageBlockResponse)
    ).toBe(false)
    expect(
      isArticleCuratedHomepageBlock({
        blockType: 'article-grid'
      } as PageBlockResponse)
    ).toBe(true)
    expect(
      isArticleCuratedHomepageBlock({
        blockType: 'tour-grid'
      } as PageBlockResponse)
    ).toBe(false)
  })

  it('validates sparse and ranged slot counts', () => {
    expect(isValidHomepageBlockSlotCount('article-grid', 3)).toBe(true)
    expect(isValidHomepageBlockSlotCount('article-grid', 4)).toBe(true)
    expect(isValidHomepageBlockSlotCount('article-grid', 8)).toBe(true)
    expect(isValidHomepageBlockSlotCount('article-grid', 6)).toBe(false)
    expect(isValidHomepageBlockSlotCount('featured-articles', 6)).toBe(false)
    expect(isValidHomepageBlockSlotCount('editorial-feature', 2)).toBe(true)
    expect(isValidHomepageBlockSlotCount('editorial-feature', 5)).toBe(false)
    expect(isValidHomepageBlockSlotCount('hotel-grid', 4)).toBe(true)
    expect(isValidHomepageBlockSlotCount('hotel-grid', 20)).toBe(true)
    expect(isValidHomepageBlockSlotCount('hotel-grid', 3)).toBe(false)
    expect(isValidHomepageBlockSlotCount('hotel-grid', 21)).toBe(false)
    expect(isValidHomepageBlockSlotCount('tour-grid', 20)).toBe(true)
    expect(isValidHomepageBlockSlotCount('newsletter-signup', 0)).toBe(true)
    expect(isValidHomepageBlockSlotCount('newsletter-signup', 1)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'

import { curatedBlockRegistry } from './registry'

/**
 * The exact set + order the registry replaces. Mirrors the historical
 * `HOMEPAGE_BLOCK_TYPES` array in `collection.ts` and the runtime body of the
 * old `isCuratedHomepageBlockType` guard. If a block type is added/removed,
 * this list updates with it — that is the point of the registry.
 */
const EXPECTED_KEYS = [
  'featured-article',
  'featured-creator-article',
  'featured-article-carousel',
  'featured-articles',
  'editorial-feature',
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

describe('curatedBlockRegistry', () => {
  it('exposes the curated block types in editor order', () => {
    expect(curatedBlockRegistry.keys).toEqual(EXPECTED_KEYS)
  })

  it('returns a Block for every key, with slug === blockType, in the same order', () => {
    expect(curatedBlockRegistry.blocks.map((block) => block.slug)).toEqual([...EXPECTED_KEYS])
  })

  it('hands out a fresh blocks array each access (callers may mutate)', () => {
    expect(curatedBlockRegistry.blocks).not.toBe(curatedBlockRegistry.blocks)
    expect(curatedBlockRegistry.blocks).toEqual(curatedBlockRegistry.blocks)
  })

  describe('has', () => {
    it('is true for every registered type', () => {
      for (const key of EXPECTED_KEYS) {
        expect(curatedBlockRegistry.has(key)).toBe(true)
      }
    })

    it('is false for unknown or non-string values', () => {
      expect(curatedBlockRegistry.has('not-a-block')).toBe(false)
      expect(curatedBlockRegistry.has('')).toBe(false)
      expect(curatedBlockRegistry.has(undefined)).toBe(false)
      expect(curatedBlockRegistry.has(null)).toBe(false)
      expect(curatedBlockRegistry.has(42)).toBe(false)
      expect(curatedBlockRegistry.has({ blockType: 'hotel-grid' })).toBe(false)
    })
  })

  describe('get', () => {
    it('returns the definition for a registered type', () => {
      const definition = curatedBlockRegistry.get('hotel-grid')
      expect(definition?.blockType).toBe('hotel-grid')
      expect(definition?.block.slug).toBe('hotel-grid')
    })

    it('returns undefined for an unregistered type', () => {
      expect(curatedBlockRegistry.get('not-a-block')).toBeUndefined()
    })
  })

  describe('behavior', () => {
    it('every registered type carries a behavior with a read-path resolver', () => {
      for (const key of EXPECTED_KEYS) {
        const behavior = curatedBlockRegistry.get(key)?.behavior
        expect(behavior, key).toBeDefined()
        expect(typeof behavior?.resolveSelection, key).toBe('function')
      }
    })

    it('marks exactly the article-style block types for publish rules', () => {
      const articleTypes = EXPECTED_KEYS.filter(
        (key) => curatedBlockRegistry.get(key)?.behavior.isArticleBlock === true,
      )
      expect(articleTypes).toEqual([
        'featured-article',
        'featured-creator-article',
        'featured-article-carousel',
        'featured-articles',
        'editorial-feature',
        'article-grid',
        'questurian-maps',
        'where-to-eat-drink',
        'things-to-do-listicles',
        'article-list',
      ])
    })

    it('reference blocks build stored items; newsletter-signup clears them instead', () => {
      expect(curatedBlockRegistry.get('newsletter-signup')?.behavior.clearsItems).toBe(true)
      expect(
        curatedBlockRegistry.get('newsletter-signup')?.behavior.buildStoredItems,
      ).toBeUndefined()
      expect(typeof curatedBlockRegistry.get('hotel-grid')?.behavior.buildStoredItems).toBe(
        'function',
      )
    })

    it('resolves the required image field per article block, defaulting to image', () => {
      const requiredImageField = (
        blockType: string,
        block: Record<string, unknown>,
        slot: number,
      ) => {
        const resolver = curatedBlockRegistry.get(blockType)?.behavior.requiredImageField
        return resolver ? resolver(block, slot) : 'image'
      }

      expect(requiredImageField('featured-article', {}, 0)).toBe('imageHero')
      expect(requiredImageField('featured-creator-article', {}, 0)).toBe('imageHero')
      expect(requiredImageField('featured-articles', {}, 0)).toBe('imageHero')
      expect(requiredImageField('featured-articles', {}, 1)).toBe('image')
      expect(requiredImageField('editorial-feature', { selection: { totalSlots: 3 } }, 0)).toBe(
        'imageSquare',
      )
      expect(requiredImageField('editorial-feature', { selection: { totalSlots: 4 } }, 0)).toBe(
        'imageWide',
      )
      expect(
        requiredImageField('editorial-feature', { selection: { totalSlots: 6 } }, 0),
      ).toBeNull()
      expect(requiredImageField('article-grid', { selection: { totalSlots: 8 } }, 0)).toBe(
        'imageSquare',
      )
      expect(requiredImageField('article-grid', { articleGridFourLayout: 'two-by-two' }, 0)).toBe(
        'imageSquare',
      )
      expect(requiredImageField('article-grid', { selection: { totalSlots: 4 } }, 0)).toBe('image')
      expect(requiredImageField('hotel-grid', {}, 0)).toBe('image')
    })
  })

  describe('metadata', () => {
    it('exposes slot-count metadata for every block', () => {
      expect(
        Object.fromEntries(
          EXPECTED_KEYS.map((key) => {
            const counts = curatedBlockRegistry.get(key)?.slotCounts
            return [key, counts && { min: counts.min, max: counts.max, default: counts.default }]
          }),
        ),
      ).toEqual({
        'featured-article': { min: 1, max: 1, default: 1 },
        'featured-creator-article': { min: 1, max: 1, default: 1 },
        'featured-article-carousel': { min: 2, max: 10, default: 3 },
        'featured-articles': { min: 3, max: 9, default: 4 },
        'editorial-feature': { min: 2, max: 6, default: 3 },
        'article-grid': { min: 4, max: 8, default: 4 },
        'location-grid': { min: 4, max: 8, default: 4 },
        'questurian-maps': { min: 6, max: 6, default: 6 },
        'hotel-grid': { min: 4, max: 20, default: 4 },
        'tour-grid': { min: 4, max: 20, default: 4 },
        'where-to-eat-drink': { min: 3, max: 12, default: 4 },
        'things-to-do-listicles': { min: 3, max: 12, default: 4 },
        'things-to-do-attractions': { min: 3, max: 12, default: 4 },
        'newsletter-signup': { min: 0, max: 0, default: 0 },
        'article-list': { min: 5, max: 25, default: 5 },
      })
      expect(curatedBlockRegistry.get('article-grid')?.slotCounts.validCounts).toEqual([4, 8])
      expect(curatedBlockRegistry.get('featured-articles')?.slotCounts.validCounts).toEqual([
        3, 4, 5, 7, 8, 9,
      ])
      expect(curatedBlockRegistry.get('editorial-feature')?.slotCounts.validCounts).toEqual([
        2, 3, 4, 6,
      ])
    })

    it('derives empty-convert source types from registry metadata', () => {
      expect(curatedBlockRegistry.emptyConvertSourceBlockTypes).toEqual([
        'featured-article',
        'featured-creator-article',
        'featured-article-carousel',
        'featured-articles',
        'editorial-feature',
        'article-grid',
        'location-grid',
        'questurian-maps',
        'hotel-grid',
        'tour-grid',
        'where-to-eat-drink',
        'things-to-do-listicles',
        'things-to-do-attractions',
      ])
    })

    it('derives public article block types from registry metadata', () => {
      expect([...curatedBlockRegistry.publicArticleBlockTypes]).toEqual([
        'featured-article',
        'featured-creator-article',
        'featured-article-carousel',
        'featured-articles',
        'editorial-feature',
        'article-grid',
        'questurian-maps',
        'where-to-eat-drink',
        'things-to-do-listicles',
        'article-list',
      ])
    })
  })
})

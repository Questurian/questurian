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
        'featured-article-carousel',
        'featured-articles',
        'article-grid',
        'questurian-maps',
        'where-to-eat-drink',
        'things-to-do-listicles',
        'article-list',
      ])
    })

    it('reference blocks build stored items; newsletter-signup clears them instead', () => {
      expect(curatedBlockRegistry.get('newsletter-signup')?.behavior.clearsItems).toBe(true)
      expect(curatedBlockRegistry.get('newsletter-signup')?.behavior.buildStoredItems).toBeUndefined()
      expect(typeof curatedBlockRegistry.get('hotel-grid')?.behavior.buildStoredItems).toBe('function')
    })

    it('resolves the required image field per article block, defaulting to image', () => {
      const requiredImageField = (blockType: string, block: Record<string, unknown>, slot: number) =>
        curatedBlockRegistry.get(blockType)?.behavior.requiredImageField?.(block, slot) ?? 'image'

      expect(requiredImageField('featured-article', {}, 0)).toBe('imageHero')
      expect(requiredImageField('featured-articles', {}, 0)).toBe('imageHero')
      expect(requiredImageField('featured-articles', {}, 1)).toBe('image')
      expect(requiredImageField('article-grid', { selection: { totalSlots: 8 } }, 0)).toBe('imageSquare')
      expect(requiredImageField('article-grid', { articleGridFourLayout: 'two-by-two' }, 0)).toBe(
        'imageSquare',
      )
      expect(requiredImageField('article-grid', { selection: { totalSlots: 4 } }, 0)).toBe('image')
      expect(requiredImageField('hotel-grid', {}, 0)).toBe('image')
    })
  })
})

import { describe, expect, it } from 'vitest'

import { assertFeaturedArticlesBlockConvertible } from './convert-empty-featured-articles-block'

describe('assertFeaturedArticlesBlockConvertible', () => {
  it('allows empty featured-articles', () => {
    expect(() =>
      assertFeaturedArticlesBlockConvertible({
        id: '1',
        blockType: 'featured-articles',
        items: [],
      }),
    ).not.toThrow()
  })

  it('allows empty featured-article', () => {
    expect(() =>
      assertFeaturedArticlesBlockConvertible({
        id: '1',
        blockType: 'featured-article',
        items: [],
      }),
    ).not.toThrow()
  })

  it('rejects non-empty items', () => {
    expect(() =>
      assertFeaturedArticlesBlockConvertible({
        id: '1',
        blockType: 'featured-article',
        items: [{ id: 'x' }],
      }),
    ).toThrow(/Clear all saved picks/)
  })

  it('allows empty article-grid', () => {
    expect(() =>
      assertFeaturedArticlesBlockConvertible({
        id: '1',
        blockType: 'article-grid',
        items: [],
      }),
    ).not.toThrow()
  })

  it('allows empty questurian-maps', () => {
    expect(() =>
      assertFeaturedArticlesBlockConvertible({
        id: '1',
        blockType: 'questurian-maps',
        items: [],
      }),
    ).not.toThrow()
  })

  it('allows empty hotel-grid', () => {
    expect(() =>
      assertFeaturedArticlesBlockConvertible({
        id: '1',
        blockType: 'hotel-grid',
        items: [],
      }),
    ).not.toThrow()
  })

  it('allows empty location-grid', () => {
    expect(() =>
      assertFeaturedArticlesBlockConvertible({
        id: '1',
        blockType: 'location-grid',
        items: [],
      }),
    ).not.toThrow()
  })
})

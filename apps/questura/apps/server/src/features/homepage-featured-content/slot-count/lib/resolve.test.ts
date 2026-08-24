import { describe, expect, it } from 'vitest'

import { resolveStoredSlotCountForBlockType } from './resolve'

describe('resolveStoredSlotCountForBlockType', () => {
  it('uses canonical counts for fixed-size types', () => {
    expect(resolveStoredSlotCountForBlockType('featured-article', 99)).toBe(1)
    expect(resolveStoredSlotCountForBlockType('featured-creator-article', 99)).toBe(1)
    expect(resolveStoredSlotCountForBlockType('questurian-maps', 1)).toBe(6)
    expect(resolveStoredSlotCountForBlockType('newsletter-signup', 5)).toBe(0)
  })

  it('clamps variable types to valid range', () => {
    expect(resolveStoredSlotCountForBlockType('article-grid', 1)).toBe(4)
    expect(resolveStoredSlotCountForBlockType('article-grid', 10)).toBe(4)
    expect(resolveStoredSlotCountForBlockType('article-grid', 5)).toBe(4)
    expect(resolveStoredSlotCountForBlockType('featured-articles', 2)).toBe(3)
    expect(resolveStoredSlotCountForBlockType('featured-articles', 12)).toBe(9)
    expect(resolveStoredSlotCountForBlockType('hotel-grid', 3)).toBe(4)
    expect(resolveStoredSlotCountForBlockType('hotel-grid', 21)).toBe(20)
    expect(resolveStoredSlotCountForBlockType('tour-grid', 3)).toBe(4)
    expect(resolveStoredSlotCountForBlockType('tour-grid', 21)).toBe(20)
  })

  it('keeps in-range stored values', () => {
    expect(resolveStoredSlotCountForBlockType('article-grid', 3)).toBe(3)
    expect(resolveStoredSlotCountForBlockType('article-grid', 4)).toBe(4)
    expect(resolveStoredSlotCountForBlockType('article-grid', 8)).toBe(8)
    expect(resolveStoredSlotCountForBlockType('featured-articles', 7)).toBe(7)
    expect(resolveStoredSlotCountForBlockType('hotel-grid', 14)).toBe(14)
    expect(resolveStoredSlotCountForBlockType('tour-grid', 20)).toBe(20)
  })
})

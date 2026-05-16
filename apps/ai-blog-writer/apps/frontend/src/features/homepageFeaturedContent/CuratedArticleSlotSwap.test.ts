import { describe, expect, it } from 'vitest'

import {
  swapCuratedArticleSlots,
  swapCuratedSlots
} from './CuratedArticleSlotSwap'
import type { SlotValue } from './useHomepageFeaturedSlots'

function article(id: number, title: string): NonNullable<SlotValue> {
  return {
    relationTo: 'articles',
    id,
    slot: id,
    title,
    slug: `article-${id}`,
    status: 'published',
    updatedAt: null,
    publishedAt: null,
    collectionLabel: 'Article',
    imageUrl: null,
    excerpt: null,
    authorLabel: null
  }
}

describe('swapCuratedArticleSlots', () => {
  it('exchanges only the two targeted slots', () => {
    const first = article(1, 'First')
    const second = article(2, 'Second')
    const third = article(3, 'Third')

    expect(swapCuratedArticleSlots([first, second, third], 0, 2)).toEqual([
      third,
      second,
      first
    ])
  })

  it('moves an empty slot by swapping it with a filled slot', () => {
    const first = article(1, 'First')
    const third = article(3, 'Third')

    expect(swapCuratedArticleSlots([first, null, third], 1, 2)).toEqual([
      first,
      third,
      null
    ])
  })

  it('returns the original array for invalid swaps', () => {
    const slots = [article(1, 'First'), article(2, 'Second')]

    expect(swapCuratedArticleSlots(slots, 0, 0)).toBe(slots)
    expect(swapCuratedArticleSlots(slots, -1, 1)).toBe(slots)
    expect(swapCuratedArticleSlots(slots, 0, 2)).toBe(slots)
  })
})

describe('swapCuratedSlots', () => {
  it('swaps non-article curated slot values', () => {
    const first = { id: 1, title: 'Paris' }
    const second = { id: 2, title: 'London' }

    expect(swapCuratedSlots([first, null, second], 0, 1)).toEqual([
      null,
      first,
      second
    ])
  })
})

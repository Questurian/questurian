import { describe, expect, it } from 'vitest'

import {
  buildOptimisticConvertedHomepageBlock,
  deleteHomepageBlockFromCache,
  reorderHomepageBlocksInCache,
  replaceHomepageBlockInCache
} from './homepageBlockOptimisticUpdates'
import type { MainHomepageResponse } from './api'
import type { PageBlockResponse } from './pageBlocks'

function block(id: string, totalSlots = 1): PageBlockResponse {
  return {
    id,
    blockType: 'featured-article',
    sectionHeading: null,
    sectionSubheading: null,
    selection: {
      items: [],
      invalidItems: [],
      isComplete: false,
      allowDrafts: true,
      totalSlots
    }
  }
}

describe('homepage block optimistic cache helpers', () => {
  it('reorders cached page blocks by id', () => {
    const homepage: MainHomepageResponse = {
      pageBlocks: [block('a'), block('b'), block('c')],
      publishedPageBlocks: []
    }

    expect(
      reorderHomepageBlocksInCache(homepage, ['c', 'a', 'b'])?.pageBlocks.map(
        (b) => b.id
      )
    ).toEqual(['c', 'a', 'b'])
  })

  it('leaves cached order unchanged for an invalid reorder payload', () => {
    const homepage: MainHomepageResponse = {
      pageBlocks: [block('a'), block('b')],
      publishedPageBlocks: []
    }

    expect(
      reorderHomepageBlocksInCache(homepage, ['b'])?.pageBlocks.map((b) => b.id)
    ).toEqual(['a', 'b'])
  })

  it('removes and replaces a cached block', () => {
    const homepage: MainHomepageResponse = {
      pageBlocks: [block('a'), block('b')],
      publishedPageBlocks: []
    }
    const converted = buildOptimisticConvertedHomepageBlock(
      block('b'),
      'newsletter-signup',
      0
    )

    expect(
      deleteHomepageBlockFromCache(homepage, 'a')?.pageBlocks.map((b) => b.id)
    ).toEqual(['b'])
    expect(
      replaceHomepageBlockInCache(homepage, converted)?.pageBlocks[1]
    ).toMatchObject({ id: 'b', blockType: 'newsletter-signup' })
  })

  it('builds an empty converted block with the requested slot shape', () => {
    const converted = buildOptimisticConvertedHomepageBlock(
      block('a'),
      'hotel-grid',
      6
    )

    expect(converted).toMatchObject({
      id: 'a',
      blockType: 'hotel-grid',
      selection: {
        items: [],
        invalidItems: [],
        totalSlots: 6
      }
    })
  })
})

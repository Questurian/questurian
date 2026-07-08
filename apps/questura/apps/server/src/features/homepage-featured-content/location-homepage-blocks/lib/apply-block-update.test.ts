import { describe, expect, it, vi } from 'vitest'

import { applyBlockItemsUpdate } from './apply-block-update'

function mediaSet(id: number) {
  return {
    title: `Image ${id}`,
    variants: {
      thumbnail: {
        url: `https://cdn.example.com/${id}.jpg`,
        width: 600,
        height: 400,
      },
    },
  }
}

function payloadMock() {
  return {
    findByID: vi.fn(async ({ collection, id }: { collection: string; id: number }) => {
      if (collection === 'accommodations') {
        return {
          id,
          title: `Hotel ${id}`,
          status: 'published',
          gallery: [{ image: mediaSet(id) }],
        }
      }
      if (collection === 'tours') {
        return {
          id,
          title: `Tour ${id}`,
          status: 'published',
          img: mediaSet(id),
        }
      }
      if (collection === 'attractions') {
        return {
          id,
          title: `Attraction ${id}`,
          status: 'published',
          gallery: [{ image: mediaSet(id) }],
        }
      }
      if (collection === 'single-type-listicles') {
        return {
          id,
          title: `Dining ${id}`,
          status: 'published',
          listicleType: 'dining',
          headerSection: {
            featuredMediaSet: mediaSet(id),
          },
        }
      }
      throw new Error(`Unexpected collection: ${collection}`)
    }),
  }
}

describe('applyBlockItemsUpdate', () => {
  it.each([
    ['hotel-grid', [1, 2, 3], [1, 2, 3]],
    ['tour-grid', [1, 2, 3], [1, 2, 3]],
    ['things-to-do-attractions', [1, 2, 3], [1, 2, 3]],
    [
      'where-to-eat-drink',
      [
        { relationTo: 'single-type-listicles', value: 1 },
        { relationTo: 'single-type-listicles', value: 2 },
        { relationTo: 'single-type-listicles', value: 3 },
      ],
      [
        { relationTo: 'single-type-listicles', value: 1 },
        { relationTo: 'single-type-listicles', value: 2 },
        { relationTo: 'single-type-listicles', value: 3 },
      ],
    ],
  ] as const)('updates %s via registry behavior', async (blockType, inputItems, expectedItems) => {
    const result = await applyBlockItemsUpdate(
      payloadMock() as never,
      { id: `${blockType}-1`, blockType, slotCount: 3, items: [] },
      [...inputItems],
      3,
      null,
    )

    expect(result).toEqual({
      ok: true,
      block: expect.objectContaining({
        blockType,
        slotCount: 3,
        items: expectedItems,
      }),
    })
  })

  it('rejects item updates for blocks without item behavior', async () => {
    const result = await applyBlockItemsUpdate(
      payloadMock() as never,
      { id: 'newsletter-1', blockType: 'newsletter-signup', slotCount: 0, items: [] },
      [],
      0,
      null,
    )

    expect(result).toEqual({
      ok: false,
      status: 400,
      message: '"newsletter-signup" blocks do not support item updates.',
    })
  })
})

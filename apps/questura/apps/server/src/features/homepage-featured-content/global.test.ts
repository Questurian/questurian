import { describe, expect, it } from 'vitest'

import { HomepageFeaturedContent } from './global'

const beforeValidateHook = HomepageFeaturedContent.hooks?.beforeValidate?.[0]

function buildReq(
  statusByKey: Record<string, 'draft' | 'published'> = {},
  locationById: Record<number, { level: string; locationKey: string; parentKey?: string | null; countryName?: string; cityName?: string | null; neighborhoodName?: string | null }> = {},
) {
  return {
    payload: {
      findByID: async ({
        collection,
        id,
      }: {
        collection: string
        id: number
      }) => {
        if (collection === 'locations') {
          const location = locationById[id]
          if (!location) {
            throw new Error(`Not found: locations:${id}`)
          }

          return {
            id,
            ...location,
          }
        }

        const key = `${collection}:${id}`
        const status = statusByKey[key]

        if (!status) {
          throw new Error(`Not found: ${key}`)
        }

        return {
          id,
          title: `${collection} ${id}`,
          status,
          updatedAt: '2026-04-09T10:00:00.000Z',
        }
      },
    },
  } as never
}

function buildItems(
  count = 4,
  collection: 'articles' | 'single-type-listicles' | 'listicle-itineraries' = 'articles',
) {
  return Array.from({ length: count }, (_, index) => ({
    relationTo: collection,
    value: index + 1,
  }))
}

async function runBeforeValidate(
  pageBlocks: unknown[],
  statusByKey: Record<string, 'draft' | 'published'>,
  locationById: Record<number, { level: string; locationKey: string; parentKey?: string | null; countryName?: string; cityName?: string | null; neighborhoodName?: string | null }> = {},
) {
  if (!beforeValidateHook) {
    throw new Error('HomepageFeaturedContent beforeValidate hook is unavailable')
  }

  return beforeValidateHook({
    data: {
      pageBlocks,
    },
    req: buildReq(statusByKey, locationById),
  } as never)
}

function buildStatusMap(
  items: Array<{
    relationTo: 'articles' | 'single-type-listicles' | 'listicle-itineraries'
    value: number
  }>,
): Record<string, 'draft' | 'published'> {
  return items.reduce<Record<string, 'draft' | 'published'>>((acc, item) => {
    acc[`${item.relationTo}:${item.value}`] = 'published'
    return acc
  }, {})
}

describe('HomepageFeaturedContent global validation', () => {
  it('normalizes featured-articles block items before save', async () => {
    const items = buildItems(4)
    const statuses = buildStatusMap(items)

    const result = await runBeforeValidate(
      [
        {
          blockType: 'featured-articles',
          slotCount: 4,
          items,
        },
      ],
      statuses,
    )

    expect(result).toEqual({
      pageBlocks: [
        {
          blockType: 'featured-articles',
          slotCount: 4,
          items: items.map((item) => ({
            relationTo: item.relationTo,
            value: item.value,
          })),
        },
      ],
    })
  })

  it('normalizes article-grid block items before save', async () => {
    const items = buildItems(8, 'single-type-listicles')
    const statuses = buildStatusMap(items)

    const result = await runBeforeValidate(
      [
        {
          blockType: 'article-grid',
          slotCount: 8,
          items,
        },
      ],
      statuses,
    )

    expect(result).toEqual({
      pageBlocks: [
        {
          blockType: 'article-grid',
          slotCount: 8,
          items: items.map((item) => ({
            relationTo: item.relationTo,
            value: item.value,
          })),
        },
      ],
    })
  })

  it('rejects duplicate entries inside article-grid blocks', async () => {
    const base = buildItems(7, 'articles')
    const items = [...base, { relationTo: 'articles' as const, value: 1 }]
    const statuses = buildStatusMap(buildItems(8, 'articles'))

    await expect(
      runBeforeValidate(
        [
          {
            blockType: 'article-grid',
            slotCount: 8,
            items,
          },
        ],
        statuses,
      ),
    ).rejects.toThrow(
      'Homepage featured content cannot contain duplicate entries.',
    )
  })

  it('normalizes location-grid block items before save', async () => {
    const locationById = {
      1: { level: 'city', locationKey: 'usa|new-york', parentKey: 'usa', countryName: 'United States', cityName: 'New York' },
      2: { level: 'city', locationKey: 'usa|chicago', parentKey: 'usa', countryName: 'United States', cityName: 'Chicago' },
      3: { level: 'city', locationKey: 'france|paris', parentKey: 'france', countryName: 'France', cityName: 'Paris' },
      4: { level: 'city', locationKey: 'japan|tokyo', parentKey: 'japan', countryName: 'Japan', cityName: 'Tokyo' },
    }

    const result = await runBeforeValidate(
      [
        {
          blockType: 'location-grid',
          slotCount: 4,
          items: [1, 2, 3, 4],
        },
      ],
      {},
      locationById,
    )

    expect(result).toEqual({
      pageBlocks: [
        {
          blockType: 'location-grid',
          slotCount: 4,
          mediaAspect: 'rectangle',
          items: [1, 2, 3, 4],
        },
      ],
    })
  })
})

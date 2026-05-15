import { describe, expect, it } from 'vitest'

import { LocationHomepages } from './collection'

const beforeValidateHook = LocationHomepages.hooks?.beforeValidate?.[0]

async function runBeforeValidate({
  pageBlocks,
  location,
  relatedLocations = {},
}: {
  pageBlocks: unknown[]
  location: {
    id: number
    level: 'city' | 'neighborhood'
    locationKey: string
    countryName?: string
    cityName?: string | null
    neighborhoodName?: string | null
  }
  relatedLocations?: Record<
    number,
    {
      id?: number
      level: 'city' | 'neighborhood'
      locationKey: string
      parentKey?: string | null
      countryName?: string
      cityName?: string | null
      neighborhoodName?: string | null
    }
  >
}) {
  if (!beforeValidateHook) {
    throw new Error('LocationHomepages beforeValidate hook is unavailable')
  }

  return beforeValidateHook({
    data: {
      pageBlocks,
    },
    originalDoc: {
      location,
    },
    req: {
      payload: {
        findByID: async ({ collection, id }: { collection: string; id: number }) => {
          if (collection === 'locations') {
            if (id === location.id) {
              return location
            }

            const relatedLocation = relatedLocations[id]
            if (relatedLocation) {
              return {
                id,
                coverImage: {
                  variants: {
                    thumbnail: { url: `https://cdn.example.com/loc-${id}-thumb.webp` },
                  },
                },
                ...relatedLocation,
              }
            }
          }

          throw new Error(`Unexpected lookup: ${collection}:${id}`)
        },
        find: async () => ({
          totalDocs: 0,
          docs: [],
        }),
      },
    },
  } as never)
}

describe('LocationHomepages collection validation', () => {
  it('normalizes location-grid items for city homepages', async () => {
    const result = await runBeforeValidate({
      location: {
        id: 10,
        level: 'city',
        locationKey: 'usa|austin',
        countryName: 'United States',
        cityName: 'Austin',
      },
      relatedLocations: {
        1: {
          level: 'neighborhood',
          locationKey: 'usa|austin|downtown',
          parentKey: 'usa|austin',
          countryName: 'United States',
          cityName: 'Austin',
          neighborhoodName: 'Downtown',
        },
        2: {
          level: 'neighborhood',
          locationKey: 'usa|austin|south-congress',
          parentKey: 'usa|austin',
          countryName: 'United States',
          cityName: 'Austin',
          neighborhoodName: 'South Congress',
        },
        3: {
          level: 'neighborhood',
          locationKey: 'usa|austin|hyde-park',
          parentKey: 'usa|austin',
          countryName: 'United States',
          cityName: 'Austin',
          neighborhoodName: 'Hyde Park',
        },
        4: {
          level: 'neighborhood',
          locationKey: 'usa|austin|zilker',
          parentKey: 'usa|austin',
          countryName: 'United States',
          cityName: 'Austin',
          neighborhoodName: 'Zilker',
        },
      },
      pageBlocks: [
        {
          blockType: 'location-grid',
          slotCount: 4,
          items: [
            { id: 1 },
            { id: 2 },
            { id: 3 },
            { id: 4 },
          ],
        },
      ],
    })

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

  it('rejects location-grid blocks on neighborhood homepages', async () => {
    await expect(
      runBeforeValidate({
        location: {
          id: 11,
          level: 'neighborhood',
          locationKey: 'usa|austin|south-congress',
          countryName: 'United States',
          cityName: 'Austin',
          neighborhoodName: 'South Congress',
        },
        pageBlocks: [
          {
            blockType: 'location-grid',
            slotCount: 4,
            items: [],
          },
        ],
      }),
    ).rejects.toThrow(
      'Location Grid blocks are only available on city homepages.',
    )
  })
})

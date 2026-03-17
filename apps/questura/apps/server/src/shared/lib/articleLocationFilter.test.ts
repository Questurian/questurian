import { describe, expect, it } from 'vitest'
import { createLocationFilter as createItineraryLocationFilter } from '@/features/articles/listicle-itineraries/blocks/utils/locationFilter'
import { createLocationFilter as createSingleTypeLocationFilter } from '@/features/articles/single-type-listicles/blocks/utils/locationFilter'

const createPayloadStub = (docs: Array<Record<string, unknown>>) => ({
  find: async ({ collection, where }: { collection: string; where?: Record<string, unknown> }) => {
    expect(collection).toBe('locations')

    const ids = ((where?.id as { in?: Array<string | number> } | undefined)?.in || []).map(String)
    const matches = docs.filter((doc) => ids.includes(String(doc.id)))

    return {
      docs: matches,
      totalDocs: matches.length,
      totalPages: 1,
    }
  },
}) as never

const exactNeighborhoodFilter = {
  and: [
    { status: { equals: 'published' } },
    {
      or: [
        {
          location: {
            in: ['peru|lima|miraflores', 'peru|lima|barranco'],
          },
        },
        {
          locationRef: {
            in: [101, 102],
          },
        },
      ],
    },
  ],
}

describe('article location filters', () => {
  const req = {
    payload: createPayloadStub([
      {
        id: 101,
        level: 'neighborhood',
        parentKey: 'peru|lima',
        locationKey: 'peru|lima|miraflores',
      },
      {
        id: 102,
        level: 'neighborhood',
        parentKey: 'peru|lima',
        locationKey: 'peru|lima|barranco',
      },
    ]),
  } as never

  it('limits single-type listicle pickers to exact selected neighborhoods', async () => {
    const filter = createSingleTypeLocationFilter('dining')

    await expect(
      filter({
        data: {
          location: 'peru|lima',
          sharedNeighborhoods: [101, 102],
        },
        req,
      } as never),
    ).resolves.toEqual(exactNeighborhoodFilter)
  })

  it('limits itinerary pickers to exact selected neighborhoods', async () => {
    const filter = createItineraryLocationFilter('dining')

    await expect(
      filter({
        data: {
          location: 'peru|lima',
          sharedNeighborhoods: [101, 102],
        },
        req,
      } as never),
    ).resolves.toEqual(exactNeighborhoodFilter)
  })
})

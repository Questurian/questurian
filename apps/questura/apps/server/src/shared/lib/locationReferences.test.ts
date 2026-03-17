import { describe, expect, it } from 'vitest'
import {
  findLocationReferences,
  LOCATION_REFERENCE_TARGETS,
} from '../location/server/references'

describe('findLocationReferences', () => {
  it('checks sharedNeighborhoods references across all article collections', async () => {
    const calls: Array<{ collection: string; where: Record<string, unknown> }> = []

    const payload = {
      find: async ({
        collection,
        where,
      }: {
        collection: string
        where: Record<string, unknown>
      }) => {
        calls.push({ collection, where })

        const isSharedNeighborhoodQuery =
          typeof where === 'object' &&
          where !== null &&
          'sharedNeighborhoods' in where

        return {
          docs:
            collection === 'listicle-itineraries' && isSharedNeighborhoodQuery ? [{}] : [],
          totalDocs:
            collection === 'listicle-itineraries' && isSharedNeighborhoodQuery ? 1 : 0,
          totalPages: 1,
        }
      },
    } as never

    const references = await findLocationReferences(payload, 'peru|lima|miraflores', 101)

    expect(LOCATION_REFERENCE_TARGETS.map((target) => target.slug)).toEqual(
      expect.arrayContaining([
        'articles',
        'single-type-listicles',
        'listicle-itineraries',
      ]),
    )

    const sharedNeighborhoodCollections = calls
      .filter((call) => 'sharedNeighborhoods' in call.where)
      .map((call) => call.collection)

    expect(sharedNeighborhoodCollections).toEqual(
      expect.arrayContaining([
        'articles',
        'single-type-listicles',
        'listicle-itineraries',
      ]),
    )

    expect(references).toContain('Listicle Itineraries')
  })
})

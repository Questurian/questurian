import { describe, expect, it } from 'vitest'
import {
  getArticleLocationScope,
  isLocationWithinArticleScope,
  validateSharedNeighborhoodSelection,
} from '../location/server/articleLocationScope'

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

describe('article location scope helpers', () => {
  it('returns exact neighborhood scope when shared neighborhoods are selected', async () => {
    const payload = createPayloadStub([
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
    ])

    const scope = await getArticleLocationScope(payload, {
      location: 'peru|lima',
      sharedNeighborhoods: [101, 102],
    })

    expect(scope).toEqual({
      exactNeighborhoods: true,
      keys: ['peru|lima|miraflores', 'peru|lima|barranco'],
      refs: [101, 102],
    })
    expect(isLocationWithinArticleScope('peru|lima|miraflores', scope)).toBe(true)
    expect(isLocationWithinArticleScope('peru|lima|san-isidro', scope)).toBe(false)
  })

  it('validates that shared neighborhoods belong to the selected city', async () => {
    const payload = createPayloadStub([
      {
        id: 101,
        level: 'neighborhood',
        parentKey: 'peru|lima',
        locationKey: 'peru|lima|miraflores',
      },
      {
        id: 202,
        level: 'neighborhood',
        parentKey: 'peru|cusco',
        locationKey: 'peru|cusco|centro',
      },
    ])

    await expect(
      validateSharedNeighborhoodSelection(payload, {
        location: 'peru|lima',
        sharedNeighborhoods: [101],
      }),
    ).resolves.toBe(true)

    await expect(
      validateSharedNeighborhoodSelection(payload, {
        location: 'peru|lima',
        sharedNeighborhoods: [101, 202],
      }),
    ).resolves.toBe('Shared neighborhoods must all belong to the selected city.')
  })

  it('requires a city-level primary location when shared neighborhoods are selected', async () => {
    const payload = createPayloadStub([
      {
        id: 101,
        level: 'neighborhood',
        parentKey: 'peru|lima',
        locationKey: 'peru|lima|miraflores',
      },
    ])

    await expect(
      validateSharedNeighborhoodSelection(payload, {
        location: 'peru|lima|miraflores',
        sharedNeighborhoods: [101],
      }),
    ).resolves.toBe('Shared neighborhoods require a city-level primary location.')
  })

  it('rejects non-neighborhood shared locations', async () => {
    const payload = createPayloadStub([
      {
        id: 301,
        level: 'city',
        parentKey: 'peru',
        locationKey: 'peru|lima',
      },
    ])

    await expect(
      validateSharedNeighborhoodSelection(payload, {
        location: 'peru|lima',
        sharedNeighborhoods: [301],
      }),
    ).resolves.toBe('Shared neighborhoods must reference neighborhood-level locations.')
  })
})

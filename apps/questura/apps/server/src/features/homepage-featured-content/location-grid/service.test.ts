import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getLocationGridSelectionFromItems,
  searchLocationGridCandidates,
  validateLocationGridItems,
} from './service'

const CITY_HOMEPAGE_LOCATION_GRID_SCOPE = {
  childLevel: 'neighborhood' as const,
  parentKey: 'usa|austin',
}

function createPayloadMock() {
  return {
    findByID: vi.fn(),
    find: vi.fn(),
  }
}

describe('location grid service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects locations outside the allowed child scope', async () => {
    const payload = createPayloadMock()
    payload.findByID.mockImplementation(async ({ id }: { id: number }) => ({
      id,
      level: id === 4 ? 'city' : 'neighborhood',
      locationKey: id === 4 ? 'usa|dallas' : `usa|austin|neighborhood-${id}`,
      parentKey: id === 4 ? 'usa' : 'usa|austin',
      countryName: 'United States',
      cityName: id === 4 ? 'Austin' : `City ${id}`,
      neighborhoodName: id === 4 ? null : `Neighborhood ${id}`,
    }))

    await expect(
      validateLocationGridItems(
        payload as never,
        [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
        { slotCount: 4, scope: CITY_HOMEPAGE_LOCATION_GRID_SCOPE },
      ),
    ).rejects.toThrow('not an eligible neighborhood')
  })

  it('marks saved locations invalid when they no longer match the homepage scope', async () => {
    const payload = createPayloadMock()
    payload.findByID.mockImplementation(async ({ id }: { id: number }) => ({
      id,
      level: id === 2 ? 'city' : 'neighborhood',
      locationKey: id === 2 ? 'usa|new-york' : `usa|austin|neighborhood-${id}`,
      parentKey: id === 2 ? 'usa' : 'usa|austin',
      countryName: 'United States',
      cityName: id === 2 ? 'New York' : 'Austin',
      neighborhoodName: id === 2 ? null : `Neighborhood ${id}`,
    }))

    const selection = await getLocationGridSelectionFromItems(
      payload as never,
      [1, 2, 3, 4],
      {
        totalSlots: 4,
        scope: CITY_HOMEPAGE_LOCATION_GRID_SCOPE,
      },
    )

    expect(selection.items).toHaveLength(3)
    expect(selection.invalidItems).toEqual([
      expect.objectContaining({
        slot: 2,
        id: 2,
        reason: 'invalid_scope',
      }),
    ])
    expect(selection.isComplete).toBe(false)
  })

  it('searches eligible child locations within the parent scope', async () => {
    const payload = createPayloadMock()
    payload.find.mockResolvedValue({
      docs: [
        {
          id: 1,
          level: 'neighborhood',
          locationKey: 'usa|new-york|chelsea',
          parentKey: 'usa|new-york',
          countryName: 'United States',
          cityName: 'New York',
          neighborhoodName: 'Chelsea',
          updatedAt: '2026-04-09T10:00:00.000Z',
        },
      ],
      totalDocs: 1,
      totalPages: 1,
    })

    const response = await searchLocationGridCandidates(payload as never, {
      query: 'chel',
      page: 1,
      limit: 20,
      scope: {
        childLevel: 'neighborhood',
        parentKey: 'usa|new-york',
      },
    })

    expect(response.docs).toEqual([
      expect.objectContaining({
        id: 1,
        level: 'neighborhood',
        title: 'Chelsea',
        subtitle: 'New York, United States',
      }),
    ])
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'locations',
        depth: 2,
        sort: 'locationKey',
        overrideAccess: true,
        where: {
          and: [
            {
              level: {
                equals: 'neighborhood',
              },
            },
            {
              parentKey: {
                equals: 'usa|new-york',
              },
            },
            {
              or: [
                {
                  countryName: {
                    like: 'chel',
                  },
                },
                {
                  cityName: {
                    like: 'chel',
                  },
                },
                {
                  neighborhoodName: {
                    like: 'chel',
                  },
                },
                {
                  locationKey: {
                    like: 'chel',
                  },
                },
              ],
            },
          ],
        },
      }),
    )
  })

  it('includes cover image URL when guide media cover is populated', async () => {
    const payload = createPayloadMock()
    payload.find.mockResolvedValue({
      docs: [
        {
          id: 1,
          level: 'neighborhood',
          locationKey: 'usa|austin|downtown',
          parentKey: 'usa|austin',
          countryName: 'United States',
          cityName: 'Austin',
          neighborhoodName: 'Downtown',
          updatedAt: '2026-04-09T10:00:00.000Z',
          guide: {
            media: {
              coverImage: {
                alt_text: 'Austin skyline',
                variants: {
                  thumbnail: {
                    url: 'https://cdn.example.com/austin-thumb.jpg',
                    alt_text: 'Downtown',
                  },
                },
              },
            },
          },
        },
      ],
      totalDocs: 1,
      totalPages: 1,
    })

    const response = await searchLocationGridCandidates(payload as never, {
      query: '',
      page: 1,
      limit: 20,
      scope: CITY_HOMEPAGE_LOCATION_GRID_SCOPE,
    })

    expect(response.docs[0]?.coverImageUrl).toBe('https://cdn.example.com/austin-thumb.jpg')
    expect(response.docs[0]?.coverImageAlt).toBe('Downtown')
  })
})

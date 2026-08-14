import { describe, expect, it } from 'vitest'
import { ListicleItineraries } from './ListicleItineraries'

const beforeValidateHook = ListicleItineraries.hooks?.beforeValidate?.at(-1)

function buildReq() {
  return {
    payload: {
      find: async () => ({
        docs: [],
        totalDocs: 0,
        totalPages: 1,
      }),
      findByID: async ({
        collection,
        id,
      }: {
        collection: string
        id: string | number
      }) => {
        if (collection === 'instagram-posts' && String(id) === '55') {
          return { id: 55, title: 'Tour reel' }
        }

        if (collection === 'attractions' && String(id) === '202') {
          return {
            id: 202,
            title: 'Moray',
            location: 'peru|cusco',
            tours: [301, 302, 303, 304, 305],
            gallery: [{ image: 700 }],
          }
        }

        throw new Error(`Not found: ${collection}:${id}`)
      },
    },
  } as never
}

function buildTourAgencyItem(overrides: Record<string, unknown> = {}) {
  return {
    blockType: 'itinerary-tour-agency',
    title: 'Sacred Valley Day Tour',
    operator: 'Andes Routes',
    price: '$$',
    url: 'https://example.com/tours/sacred-valley',
    tourDuration: 8,
    startingPoint: {
      label: 'Cusco Historic Center',
      latitude: -13.5319,
      longitude: -71.9675,
    },
    blurb: {
      root: {
        type: 'root',
      },
    },
    ...overrides,
  }
}

function buildData(itemOverrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'One Day Cusco Itinerary',
    location: 'peru|cusco',
    locationRef: 1,
    sharedNeighborhoods: [],
    step1_complete: true,
    status: 'draft',
    items: [buildTourAgencyItem(itemOverrides)],
  }
}

async function runBeforeValidate(data: Record<string, unknown>) {
  if (!beforeValidateHook) {
    throw new Error('ListicleItineraries beforeValidate hook is unavailable')
  }

  return beforeValidateHook({
    data,
    originalDoc: undefined,
    operation: 'create',
    req: buildReq(),
  } as never)
}

describe('ListicleItineraries manual tour-agency validation', () => {
  it('accepts mixed existing and manual key-location rows with normalized price, duration, and starting point', async () => {
    const data = buildData({
      instagramPost: 55,
      keyLocations: [
        {
          source: 'existing',
          relatedItem: {
            relationTo: 'attractions',
            value: 202,
          },
        },
        {
          source: 'manual',
          title: 'Maras lookout',
          latitude: -13.3283,
          longitude: -72.1594,
        },
      ],
    })

    await expect(runBeforeValidate(data)).resolves.toEqual(data)
  })

  it('rejects incomplete manual key-location rows', async () => {
    const data = buildData({
      keyLocations: [
        {
          source: 'manual',
          title: 'Maras lookout',
          latitude: -13.3283,
        },
      ],
    })

    await expect(runBeforeValidate(data)).rejects.toThrow(
      "Day 1 — Stop 1 key location 1 must include a title, latitude, and longitude.",
    )
  })

  it('rejects missing tour operators', async () => {
    const data = buildData({
      operator: '',
    })

    await expect(runBeforeValidate(data)).rejects.toThrow(
      'Day 1 — Stop 1 must include a tour operator.',
    )
  })

  it('rejects invalid booking URLs', async () => {
    const data = buildData({
      url: 'not-a-valid-url',
    })

    await expect(runBeforeValidate(data)).rejects.toThrow(
      'Day 1 — Stop 1 must include a valid absolute URL.',
    )
  })

  it('rejects invalid price tiers', async () => {
    const data = buildData({
      price: 'From $89',
    })

    await expect(runBeforeValidate(data)).rejects.toThrow(
      'Day 1 — Stop 1 price must be $, $$, $$$, or $$$$.',
    )
  })

  it('rejects tour durations outside 1 to 24 hours', async () => {
    const data = buildData({
      tourDuration: 25,
    })

    await expect(runBeforeValidate(data)).rejects.toThrow(
      'Day 1 — Stop 1 must include a tour duration between 1 and 24 hours.',
    )
  })

  it('rejects label-only starting points', async () => {
    const data = buildData({
      startingPoint: {
        label: 'Cusco Historic Center',
      },
    })

    await expect(runBeforeValidate(data)).rejects.toThrow(
      'Day 1 — Stop 1 starting point must include valid latitude and longitude.',
    )
  })

  it('rejects out-of-range starting point coordinates', async () => {
    const data = buildData({
      startingPoint: {
        label: 'Cusco Historic Center',
        latitude: 120,
        longitude: -71.9675,
      },
    })

    await expect(runBeforeValidate(data)).rejects.toThrow(
      'Day 1 — Stop 1 starting point must include valid latitude and longitude.',
    )
  })

  it('rejects publishing without itinerary items', async () => {
    const data = {
      ...buildData(),
      status: 'published',
      items: [],
    }

    await expect(runBeforeValidate(data)).rejects.toThrow(
      'Publishing requires at least one itinerary stop on day 1.',
    )
  })
})

function buildAttractionStop(overrides: Record<string, unknown> = {}) {
  return {
    blockType: 'itinerary-attractions',
    item: 202,
    mediaMode: 'photos',
    selectedPhotos: [700],
    blurb: {
      root: {
        type: 'root',
      },
    },
    ...overrides,
  }
}

describe('ListicleItineraries attraction tour-picks validation', () => {
  it('accepts tour picks linked to the selected attraction', async () => {
    const data = buildData()
    data.items = [buildAttractionStop({ tours: [302, 301] })]

    await expect(runBeforeValidate(data)).resolves.toEqual(data)
  })

  it('accepts attraction stops with no tour picks', async () => {
    const data = buildData()
    data.items = [buildAttractionStop()]

    await expect(runBeforeValidate(data)).resolves.toEqual(data)
  })

  it('rejects more than 4 tour picks', async () => {
    const data = buildData()
    data.items = [buildAttractionStop({ tours: [301, 302, 303, 304, 305] })]

    await expect(runBeforeValidate(data)).rejects.toThrow(
      'Day 1 — Stop 1 can feature at most 4 tour picks.',
    )
  })

  it('rejects tour picks not linked to the selected attraction', async () => {
    const data = buildData()
    data.items = [buildAttractionStop({ tours: [301, 999] })]

    await expect(runBeforeValidate(data)).rejects.toThrow(
      'Day 1 — Stop 1 tour pick 999 is not linked to the selected attraction.',
    )
  })
})

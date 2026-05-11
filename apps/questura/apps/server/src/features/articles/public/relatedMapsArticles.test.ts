import { describe, expect, it } from 'vitest'

import { fetchRelatedMapsArticles } from './relatedMapsArticles'

type Doc = Record<string, unknown>

type FindArgs = {
  collection: string
  where?: unknown
  limit?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function fieldMatches(docValue: unknown, condition: unknown): boolean {
  if (!isRecord(condition)) return docValue === condition

  if ('equals' in condition) {
    return docValue === condition.equals
  }

  if ('in' in condition) {
    const values = Array.isArray(condition.in) ? condition.in : []
    return values.map(String).includes(String(docValue))
  }

  return docValue === condition
}

function matchesWhere(doc: Doc, where: unknown): boolean {
  if (!isRecord(where)) return true

  if (Array.isArray(where.and) && !where.and.every((item) => matchesWhere(doc, item))) {
    return false
  }

  if (Array.isArray(where.or) && !where.or.some((item) => matchesWhere(doc, item))) {
    return false
  }

  return Object.entries(where).every(([field, condition]) => {
    if (field === 'and' || field === 'or') return true
    return fieldMatches(doc[field], condition)
  })
}

function createPayloadStub({
  locations,
  maps,
  itineraries,
}: {
  locations: Doc[]
  maps: Doc[]
  itineraries: Doc[]
}) {
  const calls: FindArgs[] = []
  const payload = {
    find: async (args: FindArgs) => {
      calls.push(args)

      const source = args.collection === 'locations'
        ? locations
        : args.collection === 'single-type-listicles'
          ? maps
          : args.collection === 'listicle-itineraries'
            ? itineraries
            : []
      const matchingDocs = source.filter((doc) => matchesWhere(doc, args.where))
      const docs = typeof args.limit === 'number'
        ? matchingDocs.slice(0, args.limit)
        : matchingDocs

      return {
        docs,
        totalDocs: docs.length,
        totalPages: 1,
      }
    },
  }

  return {
    calls,
    payload: payload as never,
  }
}

describe('fetchRelatedMapsArticles', () => {
  it('returns published city-family maps plus one itinerary and excludes the current map', async () => {
    const { payload, calls } = createPayloadStub({
      locations: [
        { id: 1, country: 'peru', city: 'lima', locationKey: 'peru|lima' },
        { id: 2, country: 'peru', city: 'lima', locationKey: 'peru|lima|miraflores' },
        { id: 3, country: 'peru', city: 'lima', locationKey: 'peru|lima|barranco' },
        { id: 4, country: 'peru', city: 'cusco', locationKey: 'peru|cusco' },
      ],
      maps: [
        {
          id: 10,
          title: 'Best Brunch Lima',
          slug: 'best-brunch-lima-peru',
          status: 'published',
          location: 'peru|lima',
          locationRef: 1,
        },
        {
          id: 11,
          title: 'Best Cafes Lima',
          slug: 'best-cafes-lima',
          status: 'published',
          location: 'peru|lima',
          locationRef: 1,
          header: { featuredImage: { url: 'https://example.com/cafe.jpg' } },
        },
        {
          id: 12,
          title: 'Best Bars Miraflores',
          slug: 'best-bars-miraflores',
          status: 'published',
          location: 'peru|lima|miraflores',
          locationRef: 2,
        },
        {
          id: 13,
          title: 'Draft Lima Map',
          slug: 'draft-lima-map',
          status: 'draft',
          location: 'peru|lima',
          locationRef: 1,
        },
        {
          id: 14,
          title: 'Cusco Map',
          slug: 'cusco-map',
          status: 'published',
          location: 'peru|cusco',
          locationRef: 4,
        },
      ],
      itineraries: [
        {
          id: 21,
          title: 'Two Days in Lima',
          slug: 'two-days-in-lima',
          status: 'published',
          location: 'peru|lima|barranco',
          locationRef: 3,
        },
        {
          id: 22,
          title: 'Three Days in Lima',
          slug: 'three-days-in-lima',
          status: 'published',
          location: 'peru|lima',
          locationRef: 1,
        },
        {
          id: 23,
          title: 'Cusco Weekend',
          slug: 'cusco-weekend',
          status: 'published',
          location: 'peru|cusco',
          locationRef: 4,
        },
      ],
    })

    const articles = await fetchRelatedMapsArticles(payload, {
      country: 'peru',
      city: 'lima',
      currentSlug: 'best-brunch-lima-peru',
    })

    expect(articles.map((article) => article.slug)).toEqual([
      'best-cafes-lima',
      'two-days-in-lima',
      'best-bars-miraflores',
    ])
    expect(articles.map((article) => article.routeType)).toEqual([
      'maps',
      'itinerary',
      'maps',
    ])
    expect(articles.filter((article) => article.routeType === 'itinerary')).toHaveLength(1)
    expect(articles.some((article) => article.slug === 'draft-lima-map')).toBe(false)
    expect(articles.some((article) => article.slug === 'cusco-map')).toBe(false)
    expect(articles.some((article) => article.slug === 'cusco-weekend')).toBe(false)

    const listicleCall = calls.find((call) => call.collection === 'single-type-listicles')
    expect(JSON.stringify(listicleCall?.where)).toContain('peru|lima|miraflores')
    expect(JSON.stringify(listicleCall?.where)).not.toContain('peru|cusco')
  })
})

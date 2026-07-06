import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('payload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('payload')>()

  return {
    ...actual,
    getPayload: vi.fn(),
  }
})

vi.mock('@/features/auth/lib/auth-middleware', () => ({
  authenticateRequest: vi.fn(),
  getCorsHeaders: vi.fn(() => ({})),
  handleCorsOptions: vi.fn(),
}))

import { GET as getPublicCountryCities } from '@/app/api/public/countries/[country]/cities/route'
import {
  GET as getPublicLocationMenu,
  OPTIONS as optionsPublicLocationMenu,
} from '@/app/api/public/locations/menu/route'
import { POST as resetAllHomepageContent } from '@/app/api/homepage-featured-content/reset/route'
import { PATCH as reorderLocationHomepageBlocks } from '@/app/api/location-homepages/[id]/blocks/route'
import { GET as getPublicLocationHomepage } from '@/app/api/public/location-homepages/[country]/[city]/route'
import { authenticateRequest } from '@/features/auth/lib/auth-middleware'
import { getPayload } from 'payload'

describe('location homepage routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns only pageBlocks from the public location homepage endpoint', async () => {
    const payload = {
      find: vi.fn()
        .mockResolvedValueOnce({
          totalDocs: 1,
          docs: [{ id: 10, locationKey: 'peru|lima', level: 'city' }],
        })
        .mockResolvedValueOnce({
          totalDocs: 1,
          docs: [
            {
              id: 20,
              isEnabled: true,
              location: { id: 10, locationKey: 'peru|lima', level: 'city' },
              pageBlocks: [],
            },
          ],
        }),
    }
    vi.mocked(getPayload).mockResolvedValue(payload as never)

    const response = await getPublicLocationHomepage(
      new Request('http://localhost:4000/api/public/location-homepages/peru/lima') as never,
      { params: Promise.resolve({ country: 'peru', city: 'lima' }) },
    )
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual({ pageBlocks: [] })
    expect(payload.find).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        collection: 'location-homepages',
        depth: 0,
      }),
    )
  })

  it('returns public city pages for a country hub', async () => {
    const payload = {
      find: vi.fn()
        .mockResolvedValueOnce({
          totalDocs: 1,
          docs: [{ id: 1, locationKey: 'peru', level: 'country', countryName: 'Peru' }],
        })
        .mockResolvedValueOnce({
          totalDocs: 2,
          docs: [
            {
              id: 10,
              locationKey: 'peru|lima',
              level: 'city',
              parentKey: 'peru',
              city: 'lima',
              cityName: 'Lima',
            },
            {
              id: 11,
              locationKey: 'peru|cusco',
              level: 'city',
              parentKey: 'peru',
              city: 'cusco',
              cityName: 'Cusco',
            },
          ],
        }),
    }
    vi.mocked(getPayload).mockResolvedValue(payload as never)

    const response = await getPublicCountryCities(
      new Request('http://localhost:4000/api/public/countries/peru/cities') as never,
      { params: Promise.resolve({ country: 'peru' }) },
    )
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual({
      country: { slug: 'peru', name: 'Peru' },
      cities: [
        { slug: 'cusco', name: 'Cusco', href: '/peru/cusco' },
        { slug: 'lima', name: 'Lima', href: '/peru/lima' },
      ],
    })
    expect(payload.find).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        collection: 'locations',
        where: {
          and: [
            { level: { equals: 'city' } },
            { parentKey: { equals: 'peru' } },
          ],
        },
      }),
    )
  })

  it('returns CORS headers for the public location menu', async () => {
    const payload = {
      find: vi.fn()
        .mockResolvedValueOnce({
          totalDocs: 1,
          docs: [{ id: 1, locationKey: 'peru', level: 'country', countryName: 'Peru' }],
        })
        .mockResolvedValueOnce({
          totalDocs: 1,
          docs: [
            {
              id: 10,
              locationKey: 'peru|lima',
              level: 'city',
              country: 'peru',
              city: 'lima',
              countryName: 'Peru',
              cityName: 'Lima',
            },
          ],
        }),
    }
    vi.mocked(getPayload).mockResolvedValue(payload as never)

    const response = await getPublicLocationMenu(new Request(
      'http://localhost:4000/api/public/locations/menu',
      { headers: { origin: 'http://localhost:3000' } },
    ) as never)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3000')
    expect(data.countries).toEqual([
      {
        locationKey: 'peru',
        label: 'Peru',
        href: '/peru',
        cities: [{ locationKey: 'peru|lima', label: 'Lima', href: '/peru/lima' }],
      },
    ])
  })

  it('handles CORS preflight for the public location menu', () => {
    const response = optionsPublicLocationMenu(new Request(
      'http://localhost:4000/api/public/locations/menu',
      { method: 'OPTIONS', headers: { origin: 'http://localhost:3000' } },
    ) as never)

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3000')
  })

  it('404s country city listing for an unknown country', async () => {
    const payload = {
      find: vi.fn().mockResolvedValueOnce({
        totalDocs: 0,
        docs: [],
      }),
    }
    vi.mocked(getPayload).mockResolvedValue(payload as never)

    const response = await getPublicCountryCities(
      new Request('http://localhost:4000/api/public/countries/atlantis/cities') as never,
      { params: Promise.resolve({ country: 'atlantis' }) },
    )
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.message).toBe('Country not found.')
    expect(payload.find).toHaveBeenCalledTimes(1)
  })

  it('404s country city listing when no cities exist', async () => {
    const payload = {
      find: vi.fn()
        .mockResolvedValueOnce({
          totalDocs: 1,
          docs: [{ id: 1, locationKey: 'peru', level: 'country', countryName: 'Peru' }],
        })
        .mockResolvedValueOnce({
          totalDocs: 0,
          docs: [],
        }),
    }
    vi.mocked(getPayload).mockResolvedValue(payload as never)

    const response = await getPublicCountryCities(
      new Request('http://localhost:4000/api/public/countries/peru/cities') as never,
      { params: Promise.resolve({ country: 'peru' }) },
    )
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.message).toBe('No cities found.')
  })

  it('returns lean data for location homepage block reorder', async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      user: { role: 'editor' },
      error: null,
      status: 200,
    } as never)
    const payload = {
      findByID: vi.fn().mockResolvedValue({
        id: 10,
        pageBlocks: [
          { id: 'a', blockType: 'newsletter-signup', items: [] },
          { id: 'b', blockType: 'newsletter-signup', items: [] },
        ],
      }),
      update: vi.fn().mockResolvedValue({
        id: 10,
        pageBlocks: [
          { id: 'b', blockType: 'newsletter-signup', items: [] },
          { id: 'a', blockType: 'newsletter-signup', items: [] },
        ],
      }),
    }
    vi.mocked(getPayload).mockResolvedValue(payload as never)

    const response = await reorderLocationHomepageBlocks(new Request(
      'http://localhost:4000/api/location-homepages/10/blocks?response=lean',
      {
        method: 'PATCH',
        body: JSON.stringify({ orderedBlockIds: ['b', 'a'] }),
      },
    ) as never, { params: Promise.resolve({ id: '10' }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual({ orderedBlockIds: ['b', 'a'] })
    expect(payload.findByID).toHaveBeenCalledWith(expect.objectContaining({ depth: 0 }))
    expect(payload.update).toHaveBeenCalledWith(expect.objectContaining({ depth: 0 }))
  })

  it('clears legacy, draft, and published blocks for every homepage', async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      user: { role: 'editor' },
      error: null,
      status: 200,
    } as never)
    const payload = {
      find: vi.fn().mockResolvedValue({
        docs: [{ id: 10 }, { id: 20 }],
      }),
      update: vi.fn().mockResolvedValue({}),
      updateGlobal: vi.fn().mockResolvedValue({}),
    }
    vi.mocked(getPayload).mockResolvedValue(payload as never)

    const response = await resetAllHomepageContent(new Request(
      'http://localhost:4000/api/homepage-featured-content/reset',
      { method: 'POST' },
    ) as never)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual({ locationHomepagesCleared: 2 })
    expect(payload.update).toHaveBeenCalledTimes(2)
    expect(payload.update).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'location-homepages',
      id: 10,
      data: {
        isEnabled: false,
        pageBlocks: [],
        draftPageBlocks: [],
        publishedPageBlocks: [],
        lastPublishedAt: null,
        lastPublishedBy: null,
        publishedRevision: 0,
      },
    }))
    expect(payload.updateGlobal).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'main-homepage',
      data: {
        draftPageBlocks: [],
        publishedPageBlocks: [],
        lastPublishedAt: null,
        lastPublishedBy: null,
        publishedRevision: 0,
      },
    }))
  })
})

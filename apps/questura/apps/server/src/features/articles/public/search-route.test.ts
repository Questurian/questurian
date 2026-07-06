import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('payload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('payload')>()

  return {
    ...actual,
    getPayload: vi.fn(),
  }
})

import { GET } from '@/app/api/public/articles/search/route'
import { getPayload } from 'payload'

describe('public article search route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects short queries', async () => {
    const response = await GET(
      new NextRequest('http://localhost:4000/api/public/articles/search?q=v'),
    )
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.message).toBe('q must be at least 2 characters')
    expect(getPayload).not.toHaveBeenCalled()
  })

  it('runs ranked full-text search and returns hydrated article items in rank order', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            rows: [
              { type: 'articles', id: 1, rank: 4.2 },
              { type: 'itineraries', id: 9, rank: 1.1 },
            ],
            total_count: '2',
          },
        ],
      }),
    }
    const payload = {
      db: { pool },
      find: vi.fn(({ collection }) => {
        if (collection === 'articles') {
          return Promise.resolve({
            docs: [
              {
                id: 1,
                title: 'Visa Guide',
                slug: 'visa-guide',
                location: 'peru',
                canonicalPath: '/peru/articles/visa-guide',
                publishedAt: '2026-01-01T00:00:00.000Z',
                seoSection: { metaDescription: 'Everything to know about visas.' },
              },
            ],
          })
        }

        return Promise.resolve({
          docs: [
            {
              id: 9,
              title: 'Visa Weekend Itinerary',
              slug: 'visa-weekend',
              location: 'peru|lima',
              publishedAt: '2026-01-02T00:00:00.000Z',
              seoSection: { metaDescription: 'A visa-focused itinerary.' },
            },
          ],
        })
      }),
    }
    vi.mocked(getPayload).mockResolvedValue(payload as never)

    const response = await GET(
      new NextRequest('http://localhost:4000/api/public/articles/search?q= visa  guide &pageSize=10'),
    )
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('websearch_to_tsquery'),
      ['visa guide', 'en', 10, 0],
    )
    expect(payload.find).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'articles',
      where: { id: { in: [1] } },
    }))
    expect(payload.find).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'listicle-itineraries',
      where: { id: { in: [9] } },
    }))
    expect(data).toMatchObject({
      q: 'visa guide',
      page: 1,
      pageSize: 10,
      totalDocs: 2,
      totalPages: 1,
      items: [
        { id: 1, type: 'articles', title: 'Visa Guide', href: '/peru/articles/visa-guide' },
        { id: 9, type: 'itineraries', title: 'Visa Weekend Itinerary' },
      ],
    })
  })
})

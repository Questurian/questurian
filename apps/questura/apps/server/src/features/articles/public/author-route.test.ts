import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('payload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('payload')>()

  return {
    ...actual,
    getPayload: vi.fn(),
  }
})

import { GET } from '@/app/api/public/authors/[slug]/route'
import { getPayload } from 'payload'

describe('public author route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('hydrates nested MediaSet variants for author article thumbnails', async () => {
    const payload = {
      count: vi.fn().mockResolvedValue({ totalDocs: 1 }),
      find: vi.fn(({ collection, depth }: { collection: string; depth: number }) => {
        if (collection === 'users') {
          return Promise.resolve({
            docs: [
              {
                id: 7,
                slug: 'featured-author',
                firstName: 'Featured',
                lastName: 'Author',
                publicProfile: {},
              },
            ],
          })
        }

        if (collection !== 'listicle-itineraries') {
          return Promise.resolve({ docs: [] })
        }

        return Promise.resolve({
          docs: [
            {
              id: 17,
              title: 'Featured itinerary',
              slug: 'featured-itinerary',
              location: 'peru|lima',
              status: 'published',
              publishedAt: '2026-07-12T22:27:46.408Z',
              header: {
                featuredMediaSet: {
                  variants: {
                    thumbnail:
                      depth >= 2
                        ? {
                            url: 'https://cdn.example.com/featured-thumbnail.webp',
                            alt_text: 'Lima itinerary collage',
                          }
                        : 16407,
                  },
                },
              },
            },
          ],
        })
      }),
      findByID: vi.fn(),
    }
    vi.mocked(getPayload).mockResolvedValue(payload as never)

    const response = await GET(
      new NextRequest('http://localhost:4000/api/public/authors/featured-author?lang=en'),
      { params: Promise.resolve({ slug: 'featured-author' }) },
    )
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.articles[0].thumbnail).toEqual({
      url: 'https://cdn.example.com/featured-thumbnail.webp',
      alt: 'Lima itinerary collage',
    })
  })
})

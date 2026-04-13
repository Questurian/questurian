import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/config', () => ({
  APP_CONFIG: {
    features: {
      homepageFeaturedAllowDrafts: true,
    },
  },
}))

import {
  getHomepageFeaturedSelection,
  searchHomepageFeaturedCandidates,
  validateHomepageFeaturedItems,
} from './service'

function createPayloadMock() {
  return {
    findGlobal: vi.fn(),
    findByID: vi.fn(),
    find: vi.fn(),
  }
}

describe('homepage featured content service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects draft selections when drafts are disabled', async () => {
    const payload = createPayloadMock()
    payload.findByID.mockResolvedValue({
      id: 1,
      title: 'Draft article',
      status: 'draft',
      updatedAt: '2026-04-09T10:00:00.000Z',
    })

    await expect(
      validateHomepageFeaturedItems(
        payload as never,
        Array.from({ length: 10 }, () => ({
          relationTo: 'articles' as const,
          id: 1,
        })).map((item, index) => ({ ...item, id: index + 1 })),
        { allowDrafts: false },
      ),
    ).rejects.toThrow('must be published before it can be featured')
  })

  it('hides draft items from the read selection when drafts are disabled', async () => {
    const payload = createPayloadMock()
    payload.findGlobal.mockResolvedValue({
      items: [
        { relationTo: 'articles', value: 1 },
        { relationTo: 'single-type-listicles', value: 2 },
      ],
    })
    payload.findByID.mockImplementation(async ({ collection, id }: { collection: string; id: number }) => ({
      id,
      title: `${collection} ${id}`,
      slug: `${collection}-${id}`,
      status: id === 1 ? 'published' : 'draft',
      updatedAt: `2026-04-${id.toString().padStart(2, '0')}T10:00:00.000Z`,
      publishedAt: '2026-04-01T10:00:00.000Z',
    }))

    const selection = await getHomepageFeaturedSelection(payload as never, { allowDrafts: false })

    expect(selection.items).toHaveLength(1)
    expect(selection.items[0]).toMatchObject({
      slot: 1,
      relationTo: 'articles',
      id: 1,
    })
    expect(selection.invalidItems).toEqual([
      expect.objectContaining({
        slot: 2,
        relationTo: 'single-type-listicles',
        id: 2,
        reason: 'not_published',
      }),
    ])
    expect(selection.isComplete).toBe(false)
  })

  it('searches supported collections, respects filters, and sorts by updated date', async () => {
    const payload = createPayloadMock()
    payload.find.mockImplementation(async ({ collection, where }: { collection: string; where: Record<string, unknown> }) => ({
      docs: collection === 'articles'
        ? [
            {
              id: 1,
              title: 'Newest article',
              slug: 'newest-article',
              status: 'published',
              updatedAt: '2026-04-09T10:00:00.000Z',
              publishedAt: '2026-04-08T10:00:00.000Z',
            },
          ]
        : [
            {
              id: 2,
              title: 'Older listicle',
              slug: 'older-listicle',
              status: 'published',
              updatedAt: '2026-04-07T10:00:00.000Z',
              publishedAt: '2026-04-06T10:00:00.000Z',
            },
          ],
      totalDocs: 1,
      totalPages: 1,
      where,
    }))

    const response = await searchHomepageFeaturedCandidates(payload as never, {
      query: 'article',
      page: 1,
      limit: 20,
      allowDrafts: false,
    })

    expect(payload.find).toHaveBeenCalledTimes(3)
    expect(response.docs.map((item) => item.title)).toEqual(['Newest article', 'Older listicle', 'Older listicle'])
    expect(response.totalDocs).toBe(3)
    expect(payload.find.mock.calls[0]?.[0]).toMatchObject({
      collection: 'articles',
      depth: 3,
      sort: '-updatedAt',
      overrideAccess: true,
      where: {
        and: [
          {
            or: [
              {
                title: {
                  like: 'article',
                },
              },
              {
                slug: {
                  like: 'article',
                },
              },
            ],
          },
          {
            status: {
              equals: 'published',
            },
          },
        ],
      },
    })
  })

  it('resolves imageUrlSquare from media set square variant on selection', async () => {
    const payload = createPayloadMock()
    payload.findGlobal.mockResolvedValue({
      items: [{ relationTo: 'articles', value: 1 }],
    })
    payload.findByID.mockResolvedValue({
      id: 1,
      title: 'Article',
      slug: 'article',
      status: 'published',
      updatedAt: '2026-04-09T10:00:00.000Z',
      publishedAt: '2026-04-01T10:00:00.000Z',
      headerSection: {
        featuredImage: {
          id: 10,
          variant: 'open_graph',
          bunny_original_url: 'https://cdn.example/og.jpg',
          mediaSet: {
            variants: {
              square: {
                bunny_original_url: 'https://cdn.example/sq.jpg',
              },
            },
          },
        },
      },
    })

    const selection = await getHomepageFeaturedSelection(payload as never, { allowDrafts: true })

    expect(payload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'articles',
        id: 1,
        depth: 3,
      }),
    )
    expect(selection.items[0]?.imageUrl).toBe('https://cdn.example/og.jpg')
    expect(selection.items[0]?.imageUrlSquare).toBe('https://cdn.example/sq.jpg')
  })
})

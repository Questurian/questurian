import { describe, expect, it } from 'vitest'

import { formatPublicLocationHomepageDoc } from './service'

const articleBlockTypes = [
  'featured-article',
  'featured-article-carousel',
  'featured-articles',
  'article-grid',
  'questurian-maps',
  'where-to-eat-drink',
  'things-to-do-listicles',
]

describe('formatPublicLocationHomepageDoc', () => {
  it.each(articleBlockTypes)('reduces %s blocks to the public article shape', (blockType) => {
    const response = formatPublicLocationHomepageDoc([
      {
        id: 'block-1',
        blockType,
        sectionHeading: 'Editors picks',
        slot4Layout: 'four-across',
        selection: {
          totalSlots: 7,
          allowDrafts: true,
          isComplete: true,
          invalidItems: [],
          items: [
            {
              id: 123,
              relationTo: 'articles',
              title: 'Best Lima Cafes',
              slug: 'best-lima-cafes',
              status: 'published',
              updatedAt: '2026-04-01T00:00:00.000Z',
              publishedAt: '2026-04-01T00:00:00.000Z',
              collectionLabel: 'Standard Article',
              imageUrl: 'https://cdn.example/og.jpg',
              imageUrlSquare: 'https://cdn.example/square.jpg',
              image: {
                url: 'https://cdn.example/og.jpg',
                alt: 'Lima cafes',
                width: 600,
                height: 400,
                variant: 'thumbnail',
                status: 'ready',
              },
              imageSquare: {
                url: 'https://cdn.example/square.jpg',
                alt: 'Lima cafes square',
                width: 400,
                height: 400,
                variant: 'square',
                status: 'ready',
              },
              metaDescription: 'Fallback excerpt.',
              excerpt: 'Public excerpt.',
              author: {
                id: 7,
                slug: 'ana-rivera',
                name: 'Ana Rivera',
                firstName: 'Ana',
                lastName: 'Rivera',
                email: 'ana@example.com',
              },
              authorLabel: 'Ana Rivera',
              category: {
                id: 3,
                name: 'Guides',
                slug: 'guides',
              },
              slot: 1,
            },
          ],
        },
      },
    ] as never)

    expect(response).toEqual({
      pageBlocks: [
        {
          blockType,
          totalSlots: 7,
          sectionHeading: 'Editors picks',
          sectionSubheading: null,
          items: [
            {
              title: 'Best Lima Cafes',
              articleType: 'Guides',
              excerpt: 'Public excerpt.',
              author: {
                id: 7,
                slug: 'ana-rivera',
                name: 'Ana Rivera',
                firstName: 'Ana',
                lastName: 'Rivera',
              },
              category: {
                id: 3,
                name: 'Guides',
                slug: 'guides',
              },
              imageUrl: 'https://cdn.example/og.jpg',
              imageUrlSquare: 'https://cdn.example/square.jpg',
              image: {
                url: 'https://cdn.example/og.jpg',
                alt: 'Lima cafes',
                width: 600,
                height: 400,
                variant: 'thumbnail',
                status: 'ready',
              },
              imageSquare: {
                url: 'https://cdn.example/square.jpg',
                alt: 'Lima cafes square',
                width: 400,
                height: 400,
                variant: 'square',
                status: 'ready',
              },
            },
          ],
        },
      ],
    })

    expect(JSON.stringify(response)).not.toContain('selection')
    expect(JSON.stringify(response)).not.toContain('collectionLabel')
    expect(JSON.stringify(response)).not.toContain('authorLabel')
    expect(JSON.stringify(response)).not.toContain('publishedAt')
  })

  it('uses the collection type for listicles and itineraries', () => {
    const response = formatPublicLocationHomepageDoc([
      {
        blockType: 'featured-articles',
        selection: {
          totalSlots: 2,
          items: [
            {
              relationTo: 'single-type-listicles',
              title: 'Best Restaurants',
            },
            {
              relationTo: 'listicle-itineraries',
              title: 'Three Days in Lima',
              category: { name: 'Ignored category' },
            },
          ],
        },
      },
    ] as never)

    expect(response.pageBlocks[0]).toMatchObject({
      items: [
        { articleType: 'Questurian Maps' },
        { articleType: 'Itinerary' },
      ],
    })
  })

  it('falls back to resolved PublicImage URLs when flat fields are absent', () => {
    const response = formatPublicLocationHomepageDoc([
      {
        blockType: 'featured-articles',
        selection: {
          totalSlots: 1,
          items: [
            {
              relationTo: 'articles',
              title: 'Best Lima Cafes',
              image: {
                url: 'https://cdn.example/thumb.webp',
                alt: 'Cafes',
                width: 600,
                height: 400,
                variant: 'thumbnail',
                status: 'ready',
              },
              imageSquare: {
                url: 'https://cdn.example/square.webp',
                alt: 'Cafes square',
                width: 400,
                height: 400,
                variant: 'square',
                status: 'ready',
              },
            },
          ],
        },
      },
    ] as never)

    expect(response.pageBlocks[0]).toMatchObject({
      items: [
        {
          imageUrl: 'https://cdn.example/thumb.webp',
          imageUrlSquare: 'https://cdn.example/square.webp',
          image: {
            url: 'https://cdn.example/thumb.webp',
            alt: 'Cafes',
          },
          imageSquare: {
            url: 'https://cdn.example/square.webp',
            alt: 'Cafes square',
          },
        },
      ],
    })
  })

  it('leaves non-article blocks unchanged', () => {
    const nonArticleBlock = {
      id: 'location-grid-1',
      blockType: 'location-grid',
      mediaAspect: 'wide',
      selection: {
        totalSlots: 4,
        items: [
          {
            id: 99,
            title: 'Barranco',
            coverImageUrl: 'https://cdn.example/barranco.jpg',
          },
        ],
      },
    }

    const response = formatPublicLocationHomepageDoc([nonArticleBlock] as never)

    expect(response.pageBlocks[0]).toBe(nonArticleBlock)
  })

  it('omits incomplete article blocks from the public homepage', () => {
    const response = formatPublicLocationHomepageDoc([
      {
        blockType: 'featured-articles',
        selection: {
          totalSlots: 8,
          allowDrafts: false,
          isComplete: false,
          invalidItems: [{ slot: 7, reason: 'not_published' }],
          items: [{ relationTo: 'articles', title: 'Still valid' }],
        },
      },
    ] as never)

    expect(response).toEqual({ pageBlocks: [] })
  })

  it('returns only pageBlocks at the top level', () => {
    const response = formatPublicLocationHomepageDoc([] as never)

    expect(Object.keys(response)).toEqual(['pageBlocks'])
  })
})

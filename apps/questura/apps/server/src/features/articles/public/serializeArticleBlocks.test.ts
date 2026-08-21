import { describe, expect, it } from 'vitest'

import { serializeArticleByCollection } from './serializeArticleBlocks'

describe('serializeArticleByCollection featured image resolution', () => {
  it('resolves header.featuredMediaSet into header.featuredImage for itineraries', async () => {
    const article: Record<string, unknown> = {
      header: {
        featuredMediaSet: {
          alt_text: 'Composite alt',
          variants: {
            wide: {
              url: 'https://cdn.example/composite_wide.webp',
              width: 1920,
              height: 1080,
            },
          },
        },
        featuredImage: null,
      },
    }

    await serializeArticleByCollection('listicle-itineraries', article)

    expect((article.header as Record<string, unknown>).featuredImage).toEqual({
      url: 'https://cdn.example/composite_wide.webp',
      alt_text: 'Composite alt',
      width: 1920,
      height: 1080,
    })
  })

  it('keeps legacy featuredImage uploads working when no media set exists', async () => {
    const article: Record<string, unknown> = {
      header: {
        featuredImage: {
          url: 'https://cdn.example/legacy.jpg',
          alt_text: 'Legacy alt',
          width: 1600,
          height: 900,
        },
      },
    }

    await serializeArticleByCollection('single-type-listicles', article)

    expect((article.header as Record<string, unknown>).featuredImage).toEqual({
      url: 'https://cdn.example/legacy.jpg',
      alt_text: 'Legacy alt',
      width: 1600,
      height: 900,
    })
  })

  it('resolves headerSection.featuredMediaSet for standard articles', async () => {
    const article: Record<string, unknown> = {
      headerSection: {
        featuredMediaSet: {
          alt_text: 'Hero only',
          variants: {
            hero: {
              url: 'https://cdn.example/composite_hero.webp',
              width: 2100,
              height: 900,
            },
          },
        },
      },
    }

    await serializeArticleByCollection('articles', article)

    expect((article.headerSection as Record<string, unknown>).featuredImage).toEqual({
      url: 'https://cdn.example/composite_hero.webp',
      alt_text: 'Hero only',
      width: 2100,
      height: 900,
    })
  })

  it('nulls featuredImage when nothing resolves', async () => {
    const article: Record<string, unknown> = {
      header: {
        featuredMediaSet: { variants: {} },
      },
    }

    await serializeArticleByCollection('listicle-itineraries', article)

    expect((article.header as Record<string, unknown>).featuredImage).toBeNull()
  })

  it('leaves articles without a header section untouched', async () => {
    const article: Record<string, unknown> = { title: 'No header' }

    await serializeArticleByCollection('articles', article)

    expect(article).toEqual({ title: 'No header' })
  })
})

describe('serializeArticleByCollection author byline', () => {
  it('projects an opted-in author into a safe featured byline', async () => {
    const article: Record<string, unknown> = {
      author: {
        id: 42,
        slug: 'lima-creator',
        displayName: 'Lima Creator',
        user: { id: 7, email: 'private@example.com' },
        avatar: {
          url: 'https://cdn.example/creator.webp',
          alt_text: 'Lima Creator at a market',
        },
        socialLinks: {
          instagram: 'https://instagram.com/lima-creator',
          youtube: 'https://youtube.com/@lima-creator',
          website: 'https://creator.example',
          facebook: 'https://facebook.com/lima-creator',
        },
        articleByline: {
          showAvatar: true,
          featuredLinks: ['instagram', 'youtube', 'website', 'facebook'],
        },
      },
    }

    await serializeArticleByCollection('single-type-listicles', article)

    expect(article.author).toEqual({
      id: 42,
      slug: 'lima-creator',
      displayName: 'Lima Creator',
      articleByline: {
        avatar: {
          url: 'https://cdn.example/creator.webp',
          alt: 'Lima Creator at a market',
        },
        links: [
          { platform: 'instagram', url: 'https://instagram.com/lima-creator' },
          { platform: 'youtube', url: 'https://youtube.com/@lima-creator' },
          { platform: 'website', url: 'https://creator.example' },
        ],
      },
    })
  })
})

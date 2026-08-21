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

const blankSocialLinks = {
  instagram: null,
  twitter: null,
  facebook: null,
  linkedin: null,
  reddit: null,
  youtube: null,
  patreon: null,
  website: null,
}

describe('serializeArticleByCollection author byline', () => {
  it('projects an opted-in author into a public profile plus featured byline', async () => {
    const article: Record<string, unknown> = {
      author: {
        id: 42,
        slug: 'lima-creator',
        displayName: 'Lima Creator',
        bio: 'Lima-based writer covering markets, food, and city walks.',
        expertise: [{ area: 'Peru' }, { area: 'Street food' }, { area: '  ' }],
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
      bio: 'Lima-based writer covering markets, food, and city walks.',
      expertise: ['Peru', 'Street food'],
      avatar: {
        url: 'https://cdn.example/creator.webp',
        alt: 'Lima Creator at a market',
      },
      socialLinks: {
        ...blankSocialLinks,
        instagram: 'https://instagram.com/lima-creator',
        youtube: 'https://youtube.com/@lima-creator',
        website: 'https://creator.example',
        facebook: 'https://facebook.com/lima-creator',
      },
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
    expect(article.author).not.toHaveProperty('user')
  })

  it.each(['articles', 'single-type-listicles', 'listicle-itineraries'] as const)(
    'keeps the byline presentation hidden by default for %s',
    async (collection) => {
      const article: Record<string, unknown> = {
        author: {
          id: 42,
          slug: 'staff-writer',
          displayName: 'Staff Writer',
          avatar: { url: 'https://cdn.example/staff.webp' },
          socialLinks: { instagram: 'https://instagram.com/staff' },
        },
      }

      await serializeArticleByCollection(collection, article)

      expect(article.author).toEqual({
        id: 42,
        slug: 'staff-writer',
        displayName: 'Staff Writer',
        bio: null,
        expertise: [],
        avatar: { url: 'https://cdn.example/staff.webp', alt: null },
        socialLinks: {
          ...blankSocialLinks,
          instagram: 'https://instagram.com/staff',
        },
        articleByline: { avatar: null, links: [] },
      })
    },
  )

  it('supports avatar-only presentation and suppresses selected links without URLs', async () => {
    const article: Record<string, unknown> = {
      author: {
        id: 42,
        slug: 'camera-creator',
        displayName: 'Camera Creator',
        avatar: { url: 'https://cdn.example/camera.webp' },
        socialLinks: { instagram: 'https://instagram.com/camera' },
        articleByline: {
          showAvatar: true,
          featuredLinks: ['instagram', 'youtube'],
        },
      },
    }

    await serializeArticleByCollection('articles', article)

    expect(article.author).toEqual({
      id: 42,
      slug: 'camera-creator',
      displayName: 'Camera Creator',
      bio: null,
      expertise: [],
      avatar: { url: 'https://cdn.example/camera.webp', alt: null },
      socialLinks: {
        ...blankSocialLinks,
        instagram: 'https://instagram.com/camera',
      },
      articleByline: {
        avatar: { url: 'https://cdn.example/camera.webp', alt: null },
        links: [{ platform: 'instagram', url: 'https://instagram.com/camera' }],
      },
    })
  })
})

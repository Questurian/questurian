import { describe, expect, it } from 'vitest'

import { resolveArticleFeaturedImage } from './view-model'

describe('resolveArticleFeaturedImage', () => {
  it.each([
    {
      name: 'prefers headerSection.featuredMediaSet',
      doc: {
        headerSection: {
          featuredMediaSet: {
            alt_text: 'Preferred media set',
            variants: {
              thumbnail: {
                url: 'https://cdn.example/preferred-thumb.webp',
                width: 640,
                height: 480,
              },
            },
          },
          featuredImage: {
            url: 'https://cdn.example/legacy.jpg',
            alt_text: 'Legacy asset',
          },
        },
      },
      expectedUrl: 'https://cdn.example/preferred-thumb.webp',
      expectedAlt: 'Preferred media set',
      expectedStatus: 'ready',
    },
    {
      name: 'uses header when headerSection is absent',
      doc: {
        header: {
          featuredMediaSet: {
            variants: {
              thumbnail: {
                url: 'https://cdn.example/listicle-thumb.webp',
                alt_text: 'Listicle thumbnail',
              },
            },
          },
        },
      },
      expectedUrl: 'https://cdn.example/listicle-thumb.webp',
      expectedAlt: 'Listicle thumbnail',
      expectedStatus: 'ready',
    },
    {
      name: 'falls back to featuredImage.mediaSet',
      doc: {
        headerSection: {
          featuredMediaSet: { variants: {} },
          featuredImage: {
            url: 'https://cdn.example/legacy.jpg',
            mediaSet: {
              variants: {
                thumbnail: {
                  url: 'https://cdn.example/asset-set-thumb.webp',
                  alt_text: 'Asset media set thumbnail',
                },
              },
            },
          },
        },
      },
      expectedUrl: 'https://cdn.example/asset-set-thumb.webp',
      expectedAlt: 'Asset media set thumbnail',
      expectedStatus: 'ready',
    },
    {
      name: 'falls back to legacy featuredImage asset',
      doc: {
        headerSection: {
          featuredMediaSet: { variants: {} },
          featuredImage: {
            url: 'https://cdn.example/legacy.jpg',
            alt_text: 'Legacy asset',
          },
        },
      },
      expectedUrl: 'https://cdn.example/legacy.jpg',
      expectedAlt: 'Legacy asset',
      expectedStatus: 'legacy_fallback',
    },
  ])('$name', ({ doc, expectedUrl, expectedAlt, expectedStatus }) => {
    const image = resolveArticleFeaturedImage(doc, { placement: 'card' })

    expect(image).toMatchObject({
      url: expectedUrl,
      alt: expectedAlt,
      status: expectedStatus,
    })
  })

  it('returns missing when no article header image exists', () => {
    const image = resolveArticleFeaturedImage({ title: 'No image' }, { placement: 'card' })

    expect(image.status).toBe('missing')
    expect(image.url).toBeNull()
  })

  it('does not use legacy asset fallback when migration fallback is disabled', () => {
    const image = resolveArticleFeaturedImage(
      {
        headerSection: {
          featuredImage: {
            url: 'https://cdn.example/legacy.jpg',
            alt_text: 'Legacy asset',
          },
        },
      },
      { placement: 'card', allowMigrationFallback: false },
    )

    expect(image.status).toBe('missing')
    expect(image.url).toBeNull()
  })

  it('does not use MediaSet migration variant fallback when migration fallback is disabled', () => {
    const doc = {
      headerSection: {
        featuredMediaSet: {
          variants: {
            thumbnail: {
              url: 'https://cdn.example/thumb.webp',
            },
          },
        },
      },
    }

    const allowed = resolveArticleFeaturedImage(doc, { placement: 'wide-card' })
    const disabled = resolveArticleFeaturedImage(doc, {
      placement: 'wide-card',
      allowMigrationFallback: false,
    })

    expect(allowed).toMatchObject({
      url: 'https://cdn.example/thumb.webp',
      status: 'legacy_fallback',
      variant: 'thumbnail',
    })
    expect(disabled.status).toBe('missing')
    expect(disabled.url).toBeNull()
  })
})

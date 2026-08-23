import { describe, expect, it } from 'vitest'

import {
  isMediaSetReadyForPlacement,
  resolveLegacyAssetForPlacement,
  resolveMediaSetForPlacement,
} from './resolve-public-image'

describe('resolve-public-image', () => {
  it('resolves required placement variant with asset alt and dimensions', () => {
    const image = resolveMediaSetForPlacement(
      {
        title: 'Set title',
        alt_text: 'Set alt',
        variants: {
          thumbnail: {
            url: 'https://cdn.example/thumb.webp',
            alt_text: 'Asset alt',
            width: '600',
            height: 400,
          },
        },
      },
      'card',
    )

    expect(image).toEqual({
      url: 'https://cdn.example/thumb.webp',
      alt: 'Asset alt',
      width: 600,
      height: 400,
      variant: 'thumbnail',
      status: 'ready',
    })
  })

  it('anchors relative Payload asset URLs to the configured backend origin', () => {
    const originalBackendUrl = process.env.BACKEND_URL_LOCAL
    process.env.BACKEND_URL_LOCAL = 'http://localhost:4000'

    try {
      const image = resolveMediaSetForPlacement(
        {
          variants: {
            thumbnail: {
              url: '/api/media-assets/file/lima.webp',
            },
          },
        },
        'card',
      )

      expect(image.url).toBe('http://localhost:4000/api/media-assets/file/lima.webp')
    } finally {
      process.env.BACKEND_URL_LOCAL = originalBackendUrl
    }
  })

  it('uses Payload filename when a migrated asset has no stored URL', () => {
    const originalBackendUrl = process.env.BACKEND_URL_LOCAL
    process.env.BACKEND_URL_LOCAL = 'http://localhost:4000'

    try {
      const image = resolveMediaSetForPlacement(
        {
          variants: {
            thumbnail: {
              filename: 'lima cover_thumbnail.webp',
              width: 600,
              height: 400,
            },
          },
        },
        'card',
      )

      expect(image).toMatchObject({
        url: 'http://localhost:4000/api/media-assets/file/lima%20cover_thumbnail.webp',
        status: 'ready',
        variant: 'thumbnail',
      })
    } finally {
      process.env.BACKEND_URL_LOCAL = originalBackendUrl
    }
  })

  it('falls back from asset alt to set alt then title', () => {
    expect(
      resolveMediaSetForPlacement(
        {
          alt_text: 'Set alt',
          title: 'Set title',
          variants: {
            square: { url: 'https://cdn.example/square.webp' },
          },
        },
        'square-card',
      ).alt,
    ).toBe('Set alt')

    expect(
      resolveMediaSetForPlacement(
        {
          title: 'Set title',
          variants: {
            square: { url: 'https://cdn.example/square.webp' },
          },
        },
        'square-card',
      ).alt,
    ).toBe('Set title')
  })

  it('returns missing when required variant is absent', () => {
    expect(
      resolveMediaSetForPlacement(
        {
          variants: {
            square: { url: 'https://cdn.example/square.webp' },
          },
        },
        'card',
      ),
    ).toEqual({
      url: null,
      alt: '',
      width: null,
      height: null,
      variant: null,
      status: 'missing',
    })
  })

  it('does not treat bunny_original_url as ready canonical URL', () => {
    expect(
      resolveMediaSetForPlacement(
        {
          variants: {
            open_graph: { bunny_original_url: 'https://cdn.example/og.webp' },
          },
        },
        'open-graph',
      ).status,
    ).toBe('missing')
  })

  it('uses explicit migration fallback variants without marking them ready', () => {
    const image = resolveMediaSetForPlacement(
      {
        alt_text: 'Wide card',
        variants: {
          thumbnail: {
            url: 'https://cdn.example/thumb.webp',
            width: 600,
            height: 400,
          },
        },
      },
      'wide-card',
      { allowMigrationFallback: true },
    )

    expect(image).toEqual({
      url: 'https://cdn.example/thumb.webp',
      alt: 'Wide card',
      width: 600,
      height: 400,
      variant: 'thumbnail',
      status: 'legacy_fallback',
    })
  })

  it('supports explicit direct asset legacy fallback', () => {
    const image = resolveLegacyAssetForPlacement(
      {
        bunny_original_url: 'https://cdn.example/legacy-og.webp',
        alt_text: 'Legacy alt',
        width: 1200,
        height: 630,
        variant: 'open_graph',
      },
      'article-header',
    )

    expect(image).toEqual({
      url: 'https://cdn.example/legacy-og.webp',
      alt: 'Legacy alt',
      width: 1200,
      height: 630,
      variant: 'open_graph',
      status: 'legacy_fallback',
    })
  })

  it('checks readiness without migration fallbacks', () => {
    expect(
      isMediaSetReadyForPlacement(
        {
          variants: {
            thumbnail: { url: 'https://cdn.example/thumb.webp' },
          },
        },
        'wide-card',
      ),
    ).toBe(false)
  })
})

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

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  isMediaSetReadyForPlacement,
  resolveLegacyAssetForPlacement,
  resolveMediaSetForPlacement,
} from './resolve-public-image'

const CDN_HOST = 'questurian-cdn.b-cdn.net'

describe('resolve-public-image', () => {
  /*
   * Storage is configured in every environment that serves a reader, so the
   * suite configures it too. Without it the resolver has nowhere to point a
   * media file URL and falls back to the backend origin -- which is a real
   * branch, exercised in its own test below, but not the normal one.
   */
  let previousHostname: string | undefined

  beforeEach(() => {
    previousHostname = process.env.BUNNY_STORAGE_HOSTNAME
    process.env.BUNNY_STORAGE_HOSTNAME = CDN_HOST
  })

  afterEach(() => {
    if (previousHostname === undefined) delete process.env.BUNNY_STORAGE_HOSTNAME
    else process.env.BUNNY_STORAGE_HOSTNAME = previousHostname
  })
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

  /*
   * 15,522 rows still hold a relative `/api/media-assets/file/...` in `url`,
   * and 1,486 hold an absolute one against `localhost:4000`. Payload's
   * afterRead hook overwrites both with a CDN URL on every read, so these
   * values should never reach a reader -- but view models are also built from
   * fixtures and caches, and that route no longer serves files. Rewrite, do
   * not anchor.
   */
  it('rewrites a relative Payload media file URL to the CDN', () => {
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

    expect(image.url).toBe(`https://${CDN_HOST}/media/lima.webp`)
  })

  it('rewrites an absolute Payload media file URL to the CDN', () => {
    const image = resolveMediaSetForPlacement(
      {
        variants: {
          thumbnail: {
            url: 'http://localhost:4000/api/media-assets/file/lima%20cover.webp',
          },
        },
      },
      'card',
    )

    expect(image.url).toBe(`https://${CDN_HOST}/media/lima%20cover.webp`)
  })

  it('passes a CDN URL through untouched', () => {
    const url = `https://${CDN_HOST}/media/lima-bar-12_wide.webp`

    const image = resolveMediaSetForPlacement(
      { variants: { thumbnail: { url } } },
      'card',
    )

    expect(image.url).toBe(url)
  })

  it('still anchors non-media relative URLs to the backend origin', () => {
    const originalBackendUrl = process.env.BACKEND_URL_LOCAL
    process.env.BACKEND_URL_LOCAL = 'http://localhost:4000'

    try {
      const image = resolveMediaSetForPlacement(
        {
          variants: {
            thumbnail: {
              url: '/images/editorial/lima.webp',
            },
          },
        },
        'card',
      )

      expect(image.url).toBe('http://localhost:4000/images/editorial/lima.webp')
    } finally {
      process.env.BACKEND_URL_LOCAL = originalBackendUrl
    }
  })

  /*
   * The degraded path (landmine 2 in issue #566). It runs only when `url` came
   * back empty, which is exactly when a dead URL would be hardest to notice --
   * so it has to land on the CDN, not on the route that no longer serves.
   */
  it('falls back to a CDN URL, not an /api/ path, when a row has no stored URL', () => {
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
      url: `https://${CDN_HOST}/media/lima%20cover_thumbnail.webp`,
      status: 'ready',
      variant: 'thumbnail',
    })
  })

  it('honours a row prefix that is not the default', () => {
    const image = resolveMediaSetForPlacement(
      {
        variants: {
          thumbnail: { filename: 'x_thumbnail.webp', prefix: 'archive' },
        },
      },
      'card',
    )

    expect(image.url).toBe(`https://${CDN_HOST}/archive/x_thumbnail.webp`)
  })

  /**
   * The regression gate for issue #566. `/api/media-assets/file/` is Payload's
   * static handler, and `disablePayloadAccessControl` unregisters it -- any
   * resolver output still carrying that path is a broken image.
   */
  it('never emits an /api/media-assets/file/ URL, by any route through the resolver', () => {
    const urls = [
      resolveMediaSetForPlacement(
        { variants: { thumbnail: { url: '/api/media-assets/file/a.webp' } } },
        'card',
      ).url,
      resolveMediaSetForPlacement(
        {
          variants: {
            thumbnail: { url: 'http://localhost:4000/api/media-assets/file/b.webp' },
          },
        },
        'card',
      ).url,
      resolveMediaSetForPlacement(
        { variants: { thumbnail: { filename: 'c_thumbnail.webp' } } },
        'card',
      ).url,
      resolveLegacyAssetForPlacement(
        { filename: 'd_open_graph.webp', variant: 'open_graph' },
        'article-header',
      ).url,
      resolveLegacyAssetForPlacement(
        { bunny_original_url: '/api/media-assets/file/e.webp', variant: 'open_graph' },
        'article-header',
      ).url,
    ]

    for (const url of urls) {
      expect(url).not.toBeNull()
      expect(url).not.toContain('/api/media-assets/file/')
      expect(url).toContain(CDN_HOST)
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

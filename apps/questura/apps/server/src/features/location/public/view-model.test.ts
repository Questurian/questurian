import { describe, expect, it } from 'vitest'

import { buildPublicLocationView } from './view-model'

const cardPlacementVariant = {
  url: 'https://cdn.example.com/lima_thumbnail.webp',
  width: 1200,
  height: 800,
  alt_text: 'Lima skyline',
}

describe('buildPublicLocationView', () => {
  it('returns a placement-resolved cover image when MediaSet is ready', () => {
    const view = buildPublicLocationView(
      {
        id: 7,
        level: 'city',
        locationKey: 'peru|lima',
        countryName: 'Peru',
        cityName: 'Lima',
        coverImage: {
          title: 'Lima skyline set',
          alt_text: 'Lima skyline',
          variants: { thumbnail: cardPlacementVariant },
        },
      },
      { placement: 'card' },
    )

    expect(view.coverImage.status).toBe('ready')
    expect(view.coverImage.url).toBe(cardPlacementVariant.url)
    expect(view.coverImage.alt).toBe('Lima skyline')
    expect(view.title).toBe('Lima')
    expect(view.subtitle).toBe('Peru')
    expect(view.id).toBe(7)
  })

  it('falls back to migration fallback when allowed and required variant absent', () => {
    const view = buildPublicLocationView(
      {
        id: 8,
        level: 'city',
        countryName: 'Peru',
        cityName: 'Cusco',
        coverImage: {
          title: 'Cusco set',
          alt_text: 'Cusco',
          variants: {
            thumbnail: { url: 'thumb.webp' },
          },
        },
      },
      { placement: 'wide-card' },
    )

    expect(view.coverImage.status).toBe('legacy_fallback')
    expect(view.coverImage.url).toBe('thumb.webp')
  })

  it('returns missing image when allowMigrationFallback is false and variant absent', () => {
    const view = buildPublicLocationView(
      {
        id: 9,
        level: 'city',
        countryName: 'Peru',
        cityName: 'Arequipa',
        coverImage: {
          title: 'Arequipa set',
          variants: { thumbnail: { url: 'thumb.webp' } },
        },
      },
      { placement: 'wide-card', allowMigrationFallback: false },
    )

    expect(view.coverImage.status).toBe('missing')
    expect(view.coverImage.url).toBeNull()
  })

  it('builds a neighborhood subtitle from city + country', () => {
    const view = buildPublicLocationView(
      {
        id: 10,
        level: 'neighborhood',
        countryName: 'Peru',
        cityName: 'Lima',
        neighborhoodName: 'Miraflores',
      },
      { placement: 'card' },
    )

    expect(view.title).toBe('Miraflores')
    expect(view.subtitle).toBe('Lima, Peru')
  })

  it('falls back to "Location #id" title when no name is present', () => {
    const view = buildPublicLocationView(
      { id: 11, level: 'city' },
      { placement: 'card' },
    )

    expect(view.title).toBe('Location #11')
  })

  it('returns missing image when coverImage is absent', () => {
    const view = buildPublicLocationView(
      { id: 12, level: 'city', countryName: 'Peru', cityName: 'Trujillo' },
      { placement: 'card' },
    )

    expect(view.coverImage.status).toBe('missing')
    expect(view.coverImage.url).toBeNull()
  })
})

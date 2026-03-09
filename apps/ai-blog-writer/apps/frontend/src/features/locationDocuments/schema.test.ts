import { describe, expect, it } from 'vitest'

import {
  buildLocationHierarchyTitle,
  buildPayloadLocationBody,
  collectUnresolvedHintWarnings,
  createEmptyLocationDraft,
  getVisibleLocationSections,
  preserveDraftRelationshipHints,
  resolveLocationDraftRef,
  sanitizeLocationDraftShape,
} from './schema'
import type { LocationOption } from './types'

describe('locationDocuments schema helpers', () => {
  it('shows only country sections for country-level drafts', () => {
    expect(getVisibleLocationSections('country').map((section) => section.id)).toEqual([
      'hierarchy',
      'media',
    ])
  })

  it('builds a city payload and resolves shorthand neighborhood hints within the current city without leaking country-only guide data', () => {
    const draft = createEmptyLocationDraft()
    draft.level = 'city'
    draft.country = 'Brazil'
    draft.city = 'Rio de Janeiro'
    draft.countryName = 'Brazil'
    draft.cityName = 'Rio de Janeiro'
    draft.guide.media.coverImage = 91
    draft.guide.core.headline = 'Living in Rio Overview'
    draft.guide.explore.highlights = [
      {
        title: 'Beach circuit',
        description: 'Start in Copacabana and Ipanema.',
        relatedNeighborhoods: [],
        relatedNeighborhoodKeys: ['copacabana', 'ipanema'],
      },
    ]

    const locationOptions: LocationOption[] = [
      {
        id: 44,
        level: 'neighborhood',
        country: 'brazil',
        city: 'rio-de-janeiro',
        neighborhood: 'copacabana',
        countryName: 'Brazil',
        cityName: 'Rio de Janeiro',
        neighborhoodName: 'Copacabana',
        locationKey: 'brazil|rio-de-janeiro|copacabana',
      },
      {
        id: 45,
        level: 'neighborhood',
        country: 'brazil',
        city: 'rio-de-janeiro',
        neighborhood: 'ipanema',
        countryName: 'Brazil',
        cityName: 'Rio de Janeiro',
        neighborhoodName: 'Ipanema',
        locationKey: 'brazil|rio-de-janeiro|ipanema',
      },
      {
        id: 46,
        level: 'neighborhood',
        country: 'brazil',
        city: 'some-other-city',
        neighborhood: 'copacabana',
        countryName: 'Brazil',
        cityName: 'Some Other City',
        neighborhoodName: 'Copacabana',
        locationKey: 'brazil|some-other-city|copacabana',
      },
    ]

    expect(collectUnresolvedHintWarnings(draft, locationOptions)).toEqual([])
    const payload = buildPayloadLocationBody(draft, locationOptions)

    expect(payload.level).toBe('city')
    expect(payload.country).toBe('brazil')
    expect(payload.city).toBe('rio-de-janeiro')
    expect(payload.countryName).toBe('Brazil')
    expect(payload.cityName).toBe('Rio de Janeiro')
    expect(payload.guide?.media?.coverImage).toBe(91)
    expect(payload.guide?.core?.headline).toBe('Living in Rio Overview')
    expect(payload.guide?.explore?.highlights?.[0]?.relatedNeighborhoods).toEqual([44, 45])
  })

  it('resolves city-prefixed neighborhood hint slugs and preserves hint keys across save reloads', () => {
    const draft = createEmptyLocationDraft()
    draft.level = 'city'
    draft.country = 'Peru'
    draft.city = 'Lima'
    draft.countryName = 'Peru'
    draft.cityName = 'Lima'
    draft.guide.explore.highlights = [
      {
        title: 'Historic Center of Lima',
        description: 'Colonial core and civic plazas.',
        relatedNeighborhoods: [],
        relatedNeighborhoodKeys: ['lima-historic-center'],
      },
    ]

    const locationOptions: LocationOption[] = [
      {
        id: 71,
        level: 'neighborhood',
        country: 'peru',
        city: 'lima',
        neighborhood: 'historic-center',
        countryName: 'Peru',
        cityName: 'Lima',
        neighborhoodName: 'Historic Center',
        locationKey: 'peru|lima|historic-center',
      },
    ]

    expect(collectUnresolvedHintWarnings(draft, locationOptions)).toEqual([])

    const payload = buildPayloadLocationBody(draft, locationOptions)
    expect(payload.guide?.explore?.highlights?.[0]?.relatedNeighborhoods).toEqual([71])

    const persisted = createEmptyLocationDraft()
    persisted.level = 'city'
    persisted.country = 'Peru'
    persisted.city = 'Lima'
    persisted.countryName = 'Peru'
    persisted.cityName = 'Lima'
    persisted.guide.explore.highlights = [
      {
        title: 'Historic Center of Lima',
        description: 'Colonial core and civic plazas.',
        relatedNeighborhoods: [71],
        relatedNeighborhoodKeys: [],
      },
    ]

    const merged = preserveDraftRelationshipHints(persisted, draft)
    expect(merged.guide.explore.highlights[0]?.relatedNeighborhoodKeys).toEqual([
      'lima-historic-center',
    ])
  })

  it('resolves the current payload location ref from payload id or a matching location key', () => {
    const draft = createEmptyLocationDraft()
    draft.level = 'city'
    draft.country = 'Peru'
    draft.city = 'Lima'

    const locationOptions: LocationOption[] = [
      {
        id: 44,
        level: 'city',
        country: 'peru',
        city: 'lima',
        neighborhood: null,
        countryName: 'Peru',
        cityName: 'Lima',
        neighborhoodName: null,
        locationKey: 'peru|lima',
      },
    ]

    expect(resolveLocationDraftRef(draft, locationOptions)).toBe(44)

    draft.payloadId = 91
    expect(resolveLocationDraftRef(draft, locationOptions)).toBe(91)
  })

  it('builds a level-aware header title from hierarchy fields', () => {
    const draft = createEmptyLocationDraft()

    draft.level = 'country'
    draft.countryName = 'Peru'
    expect(buildLocationHierarchyTitle(draft)).toBe('Peru')

    draft.level = 'city'
    draft.cityName = 'Lima'
    expect(buildLocationHierarchyTitle(draft)).toBe('Lima, Peru')

    draft.level = 'neighborhood'
    draft.neighborhoodName = 'Miraflores'
    expect(buildLocationHierarchyTitle(draft)).toBe('Miraflores, Lima, Peru')
  })

  it('falls back to key parts when hierarchy names are blank', () => {
    const draft = createEmptyLocationDraft()
    draft.level = 'neighborhood'
    draft.country = 'united-states'
    draft.city = 'new-york'
    draft.neighborhood = 'upper-east-side'

    expect(buildLocationHierarchyTitle(draft)).toBe(
      'Upper East Side, New York, United States',
    )
  })

  it('preserves relationship hint arrays when sanitizing older drafts', () => {
    const sanitized = sanitizeLocationDraftShape({
      level: 'city',
      country: 'peru',
      city: 'lima',
      countryName: 'Peru',
      cityName: 'Lima',
      guide: {
        explore: {
          highlights: [
            {
              title: 'Best food district',
              description: 'Start in Miraflores.',
              relatedNeighborhoods: [],
              relatedNeighborhoodKeys: ['peru|lima|miraflores'],
            },
          ],
        },
      },
    })

    expect(sanitized.guide.explore.highlights[0]?.relatedNeighborhoodKeys).toEqual([
      'peru|lima|miraflores',
    ])
  })

  it('strips related neighborhoods from neighborhood-level payload highlights', () => {
    const draft = createEmptyLocationDraft()
    draft.level = 'neighborhood'
    draft.country = 'Peru'
    draft.city = 'Lima'
    draft.neighborhood = 'Miraflores'
    draft.countryName = 'Peru'
    draft.cityName = 'Lima'
    draft.neighborhoodName = 'Miraflores'
    draft.guide.explore.highlights = [
      {
        title: 'Walkable core',
        description: 'Everything is nearby.',
        relatedNeighborhoods: [44],
        relatedNeighborhoodKeys: ['peru|lima|barranco'],
      },
    ]

    const payload = buildPayloadLocationBody(draft, [
      {
        id: 44,
        level: 'neighborhood',
        country: 'peru',
        city: 'lima',
        neighborhood: 'barranco',
        countryName: 'Peru',
        cityName: 'Lima',
        neighborhoodName: 'Barranco',
        locationKey: 'peru|lima|barranco',
      },
    ])

    expect(payload.guide?.explore?.highlights?.[0]?.relatedNeighborhoods).toBeUndefined()
  })
})

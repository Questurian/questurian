import { describe, expect, it } from 'vitest'

import {
  buildLocationHierarchyTitle,
  buildPayloadLocationBody,
  createEmptyLocationDraft,
  getVisibleLocationSections,
  resolveLocationDraftRef,
} from './schema'
import type { LocationOption } from './types'

describe('locationDocuments schema helpers', () => {
  it('shows only country sections for country-level drafts', () => {
    expect(getVisibleLocationSections('country').map((section) => section.id)).toEqual([
      'hierarchy',
      'media',
      'countryData',
    ])
  })

  it('builds a city payload and resolves neighborhood relationship hints without leaking country-only guide data', () => {
    const draft = createEmptyLocationDraft()
    draft.level = 'city'
    draft.country = 'Peru'
    draft.city = 'Lima'
    draft.guide.media.coverImage = 91
    draft.guide.countryData.healthNotes = 'country-only field should be stripped for city payloads'
    draft.guide.localShared.headline = 'Living in Lima Overview'
    draft.guide.explore.highlights = [
      {
        title: 'Best food district',
        description: 'Start in Miraflores.',
        relatedNeighborhoods: [],
        relatedNeighborhoodKeys: ['peru|lima|miraflores'],
      },
    ]

    const locationOptions: LocationOption[] = [
      {
        id: 44,
        level: 'neighborhood',
        country: 'peru',
        city: 'lima',
        neighborhood: 'miraflores',
        countryName: 'Peru',
        cityName: 'Lima',
        neighborhoodName: 'Miraflores',
        locationKey: 'peru|lima|miraflores',
      },
    ]
    const payload = buildPayloadLocationBody(draft, locationOptions)

    expect(payload.level).toBe('city')
    expect(payload.country).toBe('peru')
    expect(payload.city).toBe('lima')
    expect(payload.countryName).toBe('Peru')
    expect(payload.cityName).toBe('Lima')
    expect(payload.guide?.countryData).toBeUndefined()
    expect(payload.guide?.media?.coverImage).toBe(91)
    expect(payload.guide?.localShared?.headline).toBe('Living in Lima Overview')
    expect(payload.guide?.explore?.highlights?.[0]?.relatedNeighborhoods).toEqual([44])
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
})

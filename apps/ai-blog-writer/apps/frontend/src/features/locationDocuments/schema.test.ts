import { describe, expect, it } from 'vitest'

import {
  buildDraftFromPayloadDoc,
  buildLocationHierarchyTitle,
  buildPayloadLocationBody,
  buildPayloadSyncSignature,
  collectUnresolvedHintWarnings,
  createEmptyLocationDraft,
  getVisibleLocationSections,
  markDraftAsPayloadSynced,
  preserveDraftRelationshipHints,
  refreshDraftPayloadSyncState,
  resolveDraftHints,
  resolveLocationDraftRef,
  sanitizeLocationDraftShape,
  validateDraft,
} from './schema'
import type { CurrencyOption, LocationOption } from './types'

describe('locationDocuments schema helpers', () => {
  it('keeps weather monthly stats AI-enabled for city drafts', () => {
    const coreSection = getVisibleLocationSections('city').find((section) => section.id === 'core')
    const weatherField = coreSection?.fields.find(
      (field) => field.type === 'group' && field.key === 'weather',
    )

    expect(weatherField?.type).toBe('group')

    const monthlyStatsField = weatherField?.type === 'group'
      ? weatherField.fields.find(
          (field) => field.type === 'array' && field.key === 'monthlyStats',
        )
      : undefined

    expect(monthlyStatsField?.type).toBe('array')
    expect(monthlyStatsField?.type === 'array' ? monthlyStatsField.aiEnabled : undefined).toBe(true)
  })

  it('blocks payload sync when city monthly stats are empty', () => {
    const draft = createEmptyLocationDraft()
    draft.level = 'city'
    draft.country = 'Peru'
    draft.city = 'Lima'
    draft.countryName = 'Peru'
    draft.cityName = 'Lima'

    expect(validateDraft(draft)).toBe(
      'Weather > Monthly Stats must include at least one month before syncing to Payload.',
    )
  })

  it('blocks payload sync when a monthly stats row has no values', () => {
    const draft = createEmptyLocationDraft()
    draft.level = 'city'
    draft.country = 'Peru'
    draft.city = 'Lima'
    draft.countryName = 'Peru'
    draft.cityName = 'Lima'
    draft.guide.core.weather.monthlyStats = [
      {
        month: 'jan',
        avgHighC: null,
        avgLowC: null,
        rainfallMm: null,
        rainDays: null,
        sunshineHours: null,
      },
    ]

    expect(validateDraft(draft)).toBe(
      'Weather > Monthly Stats row 1 needs at least one weather value.',
    )
  })

  it('shows only country sections for country-level drafts', () => {
    expect(getVisibleLocationSections('country').map((section) => section.id)).toEqual([
      'hierarchy',
      'media',
    ])
  })

  it('strips city-wide practical fields from neighborhood drafts during sanitization', () => {
    const sanitized = sanitizeLocationDraftShape({
      level: 'neighborhood',
      country: 'peru',
      city: 'lima',
      neighborhood: 'barranco',
      countryName: 'Peru',
      cityName: 'Lima',
      neighborhoodName: 'Barranco',
      guide: {
        core: {
          headline: 'Barranco',
          moneyHandling: {
            currency: 9,
            cardUsage: 'Cards accepted almost everywhere.',
          },
          weather: {
            summary: 'Same weather as Lima.',
          },
          localContext: {
            vibe: 'Creative and walkable.',
          },
        },
        explore: {
          touristVisaStatus: '90 days visa-free',
          intro: 'Art-heavy coastal neighborhood.',
        },
        move: {
          residencyVisa: 'Digital nomad visa',
          propertyPricesPerSqm: '$2,100-$3,600',
        },
      },
    })

    expect(sanitized.guide.core.headline).toBe('Barranco')
    expect(sanitized.guide.core.localContext.vibe).toBe('Creative and walkable.')
    expect(sanitized.guide.core.moneyHandling.currency).toBeNull()
    expect(sanitized.guide.core.moneyHandling.cardUsage).toBe('')
    expect(sanitized.guide.core.weather.summary).toBe('')
    expect(sanitized.guide.explore.touristVisaStatus).toBe('')
    expect(sanitized.guide.move.residencyVisa).toBe('')
    expect(sanitized.guide.move.propertyPricesPerSqm).toBe('$2,100-$3,600')
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
    draft.guide.core.moneyHandling.currency = 12
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
    expect(payload.guide?.core?.moneyHandling?.currency).toBe(12)
    expect(payload.guide?.explore?.highlights?.[0]?.relatedNeighborhoods).toEqual([44, 45])
  })

  it('resolves a local currency code to a real relationship id and strips currencyCode from the payload body', () => {
    const draft = createEmptyLocationDraft()
    draft.level = 'city'
    draft.country = 'Peru'
    draft.city = 'Lima'
    draft.countryName = 'Peru'
    draft.cityName = 'Lima'
    draft.guide.core.moneyHandling.currency = null
    draft.guide.core.moneyHandling.currencyCode = 'pen'
    draft.guide.core.moneyHandling.exchangeRateNotes = 'Airport kiosks are usually worse than city ATMs.'

    const currencyOptions: CurrencyOption[] = [
      {
        id: 14,
        code: 'PEN',
        name: 'Peruvian Sol',
        symbol: 'S/',
        displaySymbol: 'S/',
        defaultLocale: 'es-PE',
        decimalPlaces: 2,
      },
    ]

    const resolvedDraft = resolveDraftHints(draft, [], currencyOptions)
    expect(resolvedDraft.guide.core.moneyHandling.currency).toBe(14)
    expect(resolvedDraft.guide.core.moneyHandling.currencyCode).toBe('PEN')

    const payload = buildPayloadLocationBody(draft, [], currencyOptions)
    expect(payload.guide?.core?.moneyHandling?.currency).toBe(14)
    expect(payload.guide?.core?.moneyHandling?.exchangeRateNotes).toBe(
      'Airport kiosks are usually worse than city ATMs.',
    )
    expect('currencyCode' in (payload.guide?.core?.moneyHandling ?? {})).toBe(false)
  })

  it('keeps unresolved currency codes local and reports them as non-blocking warnings', () => {
    const draft = createEmptyLocationDraft()
    draft.level = 'city'
    draft.country = 'Peru'
    draft.city = 'Lima'
    draft.countryName = 'Peru'
    draft.cityName = 'Lima'
    draft.guide.core.moneyHandling.currencyCode = 'XYZ'

    expect(collectUnresolvedHintWarnings(draft, [], [])).toEqual([
      'Money Handling has an unresolved currency code: XYZ.',
    ])

    const payload = buildPayloadLocationBody(draft, [], [])
    expect(payload.guide?.core?.moneyHandling?.currency).toBeUndefined()
    expect('currencyCode' in (payload.guide?.core?.moneyHandling ?? {})).toBe(false)
  })

  it('caps related neighborhoods at four ids per highlight in the payload body', () => {
    const draft = createEmptyLocationDraft()
    draft.level = 'city'
    draft.country = 'Peru'
    draft.city = 'Lima'
    draft.countryName = 'Peru'
    draft.cityName = 'Lima'
    draft.guide.explore.highlights = [
      {
        title: 'Best districts',
        description: 'Cluster of neighborhoods to browse.',
        relatedNeighborhoods: [11, 12, 13, 14, 15],
        relatedNeighborhoodKeys: [],
      },
    ]

    const payload = buildPayloadLocationBody(draft, [])

    expect(payload.guide?.explore?.highlights?.[0]?.relatedNeighborhoods).toEqual([11, 12, 13, 14])
  })

  it('does not send city-wide practical fields for neighborhood payloads', () => {
    const draft = createEmptyLocationDraft()
    draft.level = 'neighborhood'
    draft.country = 'Peru'
    draft.city = 'Lima'
    draft.neighborhood = 'Barranco'
    draft.countryName = 'Peru'
    draft.cityName = 'Lima'
    draft.neighborhoodName = 'Barranco'
    draft.guide.core.headline = 'Barranco'
    draft.guide.core.moneyHandling.currency = 17
    draft.guide.core.moneyHandling.cardUsage = 'Mostly cards'
    draft.guide.core.weather.summary = 'Cloudy'
    draft.guide.stay.shortTermRent = '$900-$1,400'
    draft.guide.stay.touristVisaDuration = '90 days'
    draft.guide.move.propertyPricesPerSqm = '$2,100-$3,600'
    draft.guide.move.residencyVisa = 'Temporary residence permit'

    const payload = buildPayloadLocationBody(draft, [])

    expect(payload.guide?.core?.headline).toBe('Barranco')
    expect(payload.guide?.core?.moneyHandling).toBeUndefined()
    expect(payload.guide?.core?.weather).toBeUndefined()
    expect(payload.guide?.stay?.shortTermRent).toBe('$900-$1,400')
    expect(payload.guide?.stay?.touristVisaDuration).toBeUndefined()
    expect(payload.guide?.move?.propertyPricesPerSqm).toBe('$2,100-$3,600')
    expect(payload.guide?.move?.residencyVisa).toBeUndefined()
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

  it('drops old city-wide practical fields when loading a neighborhood payload doc', () => {
    const draft = buildDraftFromPayloadDoc({
      id: 31,
      level: 'neighborhood',
      country: 'peru',
      city: 'lima',
      neighborhood: 'barranco',
      countryName: 'Peru',
      cityName: 'Lima',
      neighborhoodName: 'Barranco',
      locationKey: 'peru|lima|barranco',
      guide: {
        core: {
          headline: 'Barranco',
          weather: {
            summary: 'Cloudy',
            monthlyStats: [],
          },
          moneyHandling: {
            currency: 23,
            cardUsage: 'Cards accepted',
          },
          localContext: {
            vibe: 'Creative',
            walkability: 'Very walkable',
          },
        },
        explore: {
          touristVisaStatus: '90 days',
          intro: 'Creative district',
          highlights: [],
        },
      },
    })

    expect(draft.guide.core.headline).toBe('Barranco')
    expect(draft.guide.core.localContext.vibe).toBe('Creative')
    expect(draft.guide.core.moneyHandling.currency).toBeNull()
    expect(draft.guide.core.moneyHandling.cardUsage).toBe('')
    expect(draft.guide.core.weather.summary).toBe('')
    expect(draft.guide.explore.touristVisaStatus).toBe('')
    expect(draft.guide.explore.intro).toBe('Creative district')
  })

  it('loads and preserves the city currency relationship from payload docs', () => {
    const draft = buildDraftFromPayloadDoc({
      id: 88,
      level: 'city',
      country: 'peru',
      city: 'lima',
      countryName: 'Peru',
      cityName: 'Lima',
      locationKey: 'peru|lima',
      guide: {
        core: {
          moneyHandling: {
            currency: 31,
            cardUsage: 'Cards accepted in most districts.',
          },
        },
      },
    })

    expect(draft.guide.core.moneyHandling.currency).toBe(31)
    expect(draft.guide.core.moneyHandling.cardUsage).toBe('Cards accepted in most districts.')
  })

  it('maps legacy exchangeRateDisplay payload content into exchangeRateNotes on load', () => {
    const draft = buildDraftFromPayloadDoc({
      id: 90,
      level: 'city',
      country: 'peru',
      city: 'lima',
      countryName: 'Peru',
      cityName: 'Lima',
      locationKey: 'peru|lima',
      guide: {
        core: {
          moneyHandling: {
            exchangeRateDisplay: 'ATMs usually give better rates than airport kiosks.',
          },
        },
      },
    })

    expect(draft.guide.core.moneyHandling.exchangeRateNotes).toBe(
      'ATMs usually give better rates than airport kiosks.',
    )
  })

  it('marks payload-backed drafts as synced and flips to resync-needed after edits', () => {
    const draft = createEmptyLocationDraft()
    draft.payloadId = 91
    draft.level = 'city'
    draft.country = 'peru'
    draft.city = 'lima'
    draft.countryName = 'Peru'
    draft.cityName = 'Lima'
    draft.guide.core.weather.monthlyStats = [
      {
        month: 'jan',
        avgHighC: 28,
        avgLowC: 22,
        rainfallMm: 2,
        rainDays: 1,
        sunshineHours: 220,
      },
    ]
    draft.guide.core.headline = 'City overview'

    const syncedDraft = markDraftAsPayloadSynced(draft, '2026-03-09T12:00:00.000Z')

    expect(syncedDraft.hasUnsyncedPayloadChanges).toBe(false)
    expect(syncedDraft.currentPayloadSignature).toBeTruthy()
    expect(syncedDraft.currentPayloadSignature).toBe(syncedDraft.lastPayloadSyncSignature)

    const editedDraft = createEmptyLocationDraft()
    Object.assign(editedDraft, syncedDraft)
    editedDraft.guide = structuredClone(syncedDraft.guide)
    editedDraft.guide.core.headline = 'Updated city overview'

    const refreshedDraft = refreshDraftPayloadSyncState(editedDraft)

    expect(refreshedDraft.hasUnsyncedPayloadChanges).toBe(true)
    expect(refreshedDraft.currentPayloadSignature).not.toBe(refreshedDraft.lastPayloadSyncSignature)
  })

  it('builds a stable payload sync signature for payload-backed drafts loaded from payload', () => {
    const draft = buildDraftFromPayloadDoc({
      id: 92,
      level: 'city',
      country: 'peru',
      city: 'lima',
      countryName: 'Peru',
      cityName: 'Lima',
      locationKey: 'peru|lima',
      updatedAt: '2026-03-09T12:00:00.000Z',
      guide: {
        core: {
          headline: 'Lima overview',
          weather: {
            monthlyStats: [
              {
                month: 'jan',
                avgHighC: 28,
                avgLowC: 22,
                rainfallMm: 2,
                rainDays: 1,
                sunshineHours: 220,
              },
            ],
          },
        },
      },
    })

    expect(draft.hasUnsyncedPayloadChanges).toBe(false)
    expect(draft.currentPayloadSignature).toBe(buildPayloadSyncSignature(draft))
    expect(draft.currentPayloadSignature).toBe(draft.lastPayloadSyncSignature)
    expect(draft.lastPayloadSyncAt).toBe('2026-03-09T12:00:00.000Z')
  })
})

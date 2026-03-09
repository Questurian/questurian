import { describe, expect, it } from 'vitest'
import { groupLocationIndexRowsByCountry, sortLocationIndexRows } from './utils'
import type { LocationIndexRow } from './types'

function buildRow(overrides: Partial<LocationIndexRow>): LocationIndexRow {
  return {
    id: 1,
    level: 'country',
    country: 'japan',
    city: null,
    neighborhood: null,
    countryName: 'Japan',
    cityName: null,
    neighborhoodName: null,
    locationKey: 'japan',
    updatedAt: '2026-03-09T00:00:00.000Z',
    ...overrides,
  }
}

describe('sortLocationIndexRows', () => {
  it('orders location rows by country, city, neighborhood, then level hierarchy', () => {
    const rows: LocationIndexRow[] = [
      buildRow({
        id: 5,
        level: 'neighborhood',
        country: 'japan',
        city: 'tokyo',
        neighborhood: 'shibuya',
        countryName: 'Japan',
        cityName: 'Tokyo',
        neighborhoodName: 'Shibuya',
        locationKey: 'japan|tokyo|shibuya',
      }),
      buildRow({
        id: 2,
        level: 'city',
        country: 'canada',
        city: 'toronto',
        countryName: 'Canada',
        cityName: 'Toronto',
        locationKey: 'canada|toronto',
      }),
      buildRow({
        id: 4,
        level: 'city',
        country: 'japan',
        city: 'tokyo',
        countryName: 'Japan',
        cityName: 'Tokyo',
        locationKey: 'japan|tokyo',
      }),
      buildRow({
        id: 3,
        level: 'country',
        country: 'japan',
        countryName: 'Japan',
        locationKey: 'japan',
      }),
      buildRow({
        id: 1,
        level: 'country',
        country: 'canada',
        countryName: 'Canada',
        locationKey: 'canada',
      }),
      buildRow({
        id: 6,
        level: 'neighborhood',
        country: 'canada',
        city: 'toronto',
        neighborhood: 'annex',
        countryName: 'Canada',
        cityName: 'Toronto',
        neighborhoodName: 'Annex',
        locationKey: 'canada|toronto|annex',
      }),
    ]

    expect(sortLocationIndexRows(rows).map((row) => row.locationKey)).toEqual([
      'canada',
      'canada|toronto',
      'canada|toronto|annex',
      'japan',
      'japan|tokyo',
      'japan|tokyo|shibuya',
    ])
  })

  it('groups location rows into country sections with nested city clusters', () => {
    const rows: LocationIndexRow[] = [
      buildRow({
        id: 5,
        level: 'neighborhood',
        country: 'japan',
        city: 'tokyo',
        neighborhood: 'shibuya',
        countryName: 'Japan',
        cityName: 'Tokyo',
        neighborhoodName: 'Shibuya',
        locationKey: 'japan|tokyo|shibuya',
      }),
      buildRow({
        id: 2,
        level: 'city',
        country: 'canada',
        city: 'toronto',
        countryName: 'Canada',
        cityName: 'Toronto',
        locationKey: 'canada|toronto',
      }),
      buildRow({
        id: 4,
        level: 'city',
        country: 'japan',
        city: 'tokyo',
        countryName: 'Japan',
        cityName: 'Tokyo',
        locationKey: 'japan|tokyo',
      }),
      buildRow({
        id: 3,
        level: 'country',
        country: 'japan',
        countryName: 'Japan',
        locationKey: 'japan',
      }),
      buildRow({
        id: 1,
        level: 'country',
        country: 'canada',
        countryName: 'Canada',
        locationKey: 'canada',
      }),
      buildRow({
        id: 6,
        level: 'neighborhood',
        country: 'canada',
        city: 'toronto',
        neighborhood: 'annex',
        countryName: 'Canada',
        cityName: 'Toronto',
        neighborhoodName: 'Annex',
        locationKey: 'canada|toronto|annex',
      }),
    ]

    const groups = groupLocationIndexRowsByCountry(rows)

    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.countryLabel)).toEqual(['Canada', 'Japan'])
    expect(groups[0]?.countryRow?.locationKey).toBe('canada')
    expect(groups[0]?.cityGroups[0]?.rows.map((row) => row.locationKey)).toEqual([
      'canada|toronto',
      'canada|toronto|annex',
    ])
    expect(groups[1]?.countryRow?.locationKey).toBe('japan')
    expect(groups[1]?.cityGroups[0]?.rows.map((row) => row.locationKey)).toEqual([
      'japan|tokyo',
      'japan|tokyo|shibuya',
    ])
  })
})

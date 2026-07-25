import { describe, expect, it } from 'vitest'
import type { LocationIndexRow } from '../../locationDocuments/types'
import { countGroupedLocations, groupLocationOptions } from './location-groups'

const city = {
  id: 1,
  level: 'city',
  countryName: 'Peru',
  cityName: 'Lima',
  locationKey: 'peru|lima',
} as LocationIndexRow

const barranco = {
  id: 2,
  level: 'neighborhood',
  countryName: 'Peru',
  cityName: 'Lima',
  neighborhoodName: 'Barranco',
  locationKey: 'peru|lima|barranco',
} as LocationIndexRow

const miraflores = {
  id: 3,
  level: 'neighborhood',
  countryName: 'Peru',
  cityName: 'Lima',
  neighborhoodName: 'Miraflores',
  locationKey: 'peru|lima|miraflores',
} as LocationIndexRow

describe('groupLocationOptions', () => {
  it('excludes existing locations and keeps deterministic neighborhood order', () => {
    const groups = groupLocationOptions(
      [city],
      [miraflores, barranco],
      [miraflores.id],
      '',
    )

    expect(groups[0]?.cityGroups[0]?.city?.id).toBe(city.id)
    expect(groups[0]?.cityGroups[0]?.neighborhoods.map((row) => row.id)).toEqual([
      barranco.id,
    ])
    expect(countGroupedLocations(groups)).toBe(2)
  })

  it('keeps the parent city record when only a neighborhood matches search', () => {
    const groups = groupLocationOptions(
      [city],
      [barranco, miraflores],
      [],
      'Barranco',
    )

    expect(groups[0]?.cityGroups[0]?.city?.id).toBe(city.id)
    expect(groups[0]?.cityGroups[0]?.neighborhoods.map((row) => row.id)).toEqual([
      barranco.id,
    ])
  })
})

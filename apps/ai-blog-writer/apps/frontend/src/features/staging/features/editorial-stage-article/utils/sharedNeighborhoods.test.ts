import { describe, expect, it } from 'vitest'
import type { Location } from '../../../api'
import {
  buildPrimaryLocationUpdate,
  getSharedNeighborhoodOptions,
  sanitizeSharedNeighborhoods,
} from './sharedNeighborhoods'

const locations: Location[] = [
  {
    id: 1,
    level: 'country',
    country: 'peru',
    countryName: 'Peru',
    locationKey: 'peru',
    updatedAt: '2026-03-16T00:00:00.000Z',
    createdAt: '2026-03-16T00:00:00.000Z',
  },
  {
    id: 2,
    level: 'city',
    country: 'peru',
    city: 'lima',
    countryName: 'Peru',
    cityName: 'Lima',
    locationKey: 'peru|lima',
    parentKey: 'peru',
    updatedAt: '2026-03-16T00:00:00.000Z',
    createdAt: '2026-03-16T00:00:00.000Z',
  },
  {
    id: 3,
    level: 'neighborhood',
    country: 'peru',
    city: 'lima',
    neighborhood: 'miraflores',
    countryName: 'Peru',
    cityName: 'Lima',
    neighborhoodName: 'Miraflores',
    locationKey: 'peru|lima|miraflores',
    parentKey: 'peru|lima',
    updatedAt: '2026-03-16T00:00:00.000Z',
    createdAt: '2026-03-16T00:00:00.000Z',
  },
  {
    id: 4,
    level: 'neighborhood',
    country: 'peru',
    city: 'lima',
    neighborhood: 'barranco',
    countryName: 'Peru',
    cityName: 'Lima',
    neighborhoodName: 'Barranco',
    locationKey: 'peru|lima|barranco',
    parentKey: 'peru|lima',
    updatedAt: '2026-03-16T00:00:00.000Z',
    createdAt: '2026-03-16T00:00:00.000Z',
  },
  {
    id: 5,
    level: 'city',
    country: 'peru',
    city: 'cusco',
    countryName: 'Peru',
    cityName: 'Cusco',
    locationKey: 'peru|cusco',
    parentKey: 'peru',
    updatedAt: '2026-03-16T00:00:00.000Z',
    createdAt: '2026-03-16T00:00:00.000Z',
  },
]

describe('shared neighborhood helpers', () => {
  it('returns exact neighborhood options only for a city primary location', () => {
    expect(getSharedNeighborhoodOptions(locations, 2).map((location) => location.id)).toEqual([3, 4])
    expect(getSharedNeighborhoodOptions(locations, 3)).toEqual([])
  })

  it('sanitizes selections against the selected city neighborhood set', () => {
    expect(sanitizeSharedNeighborhoods([3, 4, 5], locations, 2)).toEqual([3, 4])
    expect(sanitizeSharedNeighborhoods([3, 4], locations, 5)).toEqual([])
  })

  it('clears shared neighborhoods when the primary location changes away from the source city', () => {
    expect(buildPrimaryLocationUpdate({
      locations,
      nextLocationId: 5,
      sharedNeighborhoods: [3, 4],
    })).toEqual({
      locationId: 5,
      sharedNeighborhoods: [],
    })
  })
})

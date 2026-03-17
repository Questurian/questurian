import {
  areLocationIdSelectionsEqual,
  buildExactNeighborhoodScope,
  formatLocationLabel,
  getNeighborhoodOptionsForLocation,
  isLocationWithinArticleScope,
} from './scope'
import type { LocationDoc } from './types'

const locations: LocationDoc[] = [
  {
    id: 1,
    locationKey: 'peru',
    country: 'peru',
    level: 'country',
  },
  {
    id: 2,
    locationKey: 'peru|lima',
    country: 'peru',
    city: 'lima',
    level: 'city',
  },
  {
    id: 3,
    locationKey: 'peru|lima|barranco',
    country: 'peru',
    city: 'lima',
    neighborhood: 'barranco',
    parentKey: 'peru|lima',
    level: 'neighborhood',
  },
  {
    id: 4,
    locationKey: 'peru|lima|miraflores',
    country: 'peru',
    city: 'lima',
    neighborhood: 'miraflores',
    parentKey: 'peru|lima',
    level: 'neighborhood',
  },
  {
    id: 5,
    locationKey: 'peru|lima|san-isidro',
    country: 'peru',
    city: 'lima',
    neighborhood: 'san-isidro',
    parentKey: 'peru|lima',
    level: 'neighborhood',
  },
]

describe('locationScope helpers', () => {
  it('builds exact neighborhood scope from selected ids', () => {
    expect(buildExactNeighborhoodScope([4, 3, 4], locations)).toEqual({
      keys: ['peru|lima|miraflores', 'peru|lima|barranco'],
      refs: [4, 3],
    })
  })

  it('matches only exact neighborhoods when shared neighborhoods are selected', () => {
    expect(isLocationWithinArticleScope({
      itemLocationKey: 'peru|lima|miraflores',
      locationKey: 'peru|lima',
      sharedNeighborhoods: [3, 4],
      locations,
    })).toBe(true)

    expect(isLocationWithinArticleScope({
      itemLocationKey: 'peru|lima|san-isidro',
      locationKey: 'peru|lima',
      sharedNeighborhoods: [3, 4],
      locations,
    })).toBe(false)
  })

  it('falls back to city-wide matching when no shared neighborhoods are selected', () => {
    expect(isLocationWithinArticleScope({
      itemLocationKey: 'peru|lima|san-isidro',
      locationKey: 'peru|lima|miraflores',
    })).toBe(true)
  })

  it('returns only sibling neighborhoods for a city primary location', () => {
    expect(getNeighborhoodOptionsForLocation(locations, 'peru|lima').map((entry) => entry.id)).toEqual([3, 4, 5])
  })

  it('compares neighborhood selections without caring about order', () => {
    expect(areLocationIdSelectionsEqual([4, 3], [3, 4, 4])).toBe(true)
    expect(areLocationIdSelectionsEqual([4, 3], [3, 5])).toBe(false)
  })

  it('formats location labels from fields when available', () => {
    expect(formatLocationLabel(locations[3])).toBe('Peru > Lima > Miraflores')
  })
})

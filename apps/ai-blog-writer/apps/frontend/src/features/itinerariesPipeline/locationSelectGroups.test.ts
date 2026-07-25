import { describe, expect, it } from 'vitest'
import type { LocationOption } from '../listicleItineraries/types'
import {
  buildLocationSelectGroups,
  locationRowIdsEqual
} from './locationSelectGroups'

describe('buildLocationSelectGroups', () => {
  it('nests cities and neighborhoods under their country in display order', () => {
    const locations: LocationOption[] = [
      {
        id: 3,
        locationKey: 'peru|lima|miraflores',
        parentKey: 'peru|lima',
        country: 'peru',
        city: 'lima',
        neighborhood: 'miraflores',
        level: 'neighborhood'
      },
      {
        id: 1,
        locationKey: 'peru',
        country: 'peru',
        level: 'country'
      },
      {
        id: 2,
        locationKey: 'peru|lima',
        parentKey: 'peru',
        country: 'peru',
        city: 'lima',
        level: 'city'
      }
    ]

    expect(buildLocationSelectGroups(locations)).toEqual([
      {
        key: 'peru',
        label: 'Peru',
        options: [
          { id: 1, label: 'Peru' },
          { id: 2, label: 'Lima' },
          { id: 3, label: 'Lima › Miraflores' }
        ]
      }
    ])
  })

  it('retains unparented rows in an Other locations group', () => {
    const locations: LocationOption[] = [
      {
        id: 4,
        locationKey: 'unknown|place',
        country: 'unknown',
        city: 'place',
        level: 'city'
      }
    ]

    expect(buildLocationSelectGroups(locations)[0]).toMatchObject({
      key: '__other__',
      options: [{ id: 4 }]
    })
    expect(locationRowIdsEqual('4', 4)).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import {
  buildSaveItems,
  hasDuplicateSlots,
  mapSelectionToSlots
} from './homepageLocationGridSlots.utils'
import type { HomepageLocationGridSelection } from './locationGridTypes'

const selection: HomepageLocationGridSelection = {
  totalSlots: 3,
  isComplete: false,
  items: [
    {
      id: 10,
      slot: 2,
      level: 'city',
      locationKey: 'Peru|Lima',
      parentKey: 'Peru',
      countryName: 'Peru',
      cityName: 'Lima',
      neighborhoodName: null,
      title: 'Lima',
      subtitle: 'Peru',
      updatedAt: null,
      coverImageUrl: null,
      coverImageAlt: null
    }
  ],
  invalidItems: []
}

describe('homepage location grid slot utilities', () => {
  it('maps one-based selection slots into zero-based draft slots', () => {
    const slots = mapSelectionToSlots(selection)

    expect(slots[0]).toBeNull()
    expect(slots[1]?.id).toBe(10)
    expect(slots[2]).toBeNull()
  })

  it('detects duplicate selected locations', () => {
    const slots = mapSelectionToSlots(selection)
    slots[0] = slots[1]

    expect(hasDuplicateSlots(slots)).toBe(true)
  })

  it('builds compact save payloads from filled slots only', () => {
    expect(buildSaveItems(mapSelectionToSlots(selection))).toEqual([{ id: 10 }])
  })
})

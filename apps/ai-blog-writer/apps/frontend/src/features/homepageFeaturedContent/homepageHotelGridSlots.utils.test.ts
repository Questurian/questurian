import { describe, expect, it } from 'vitest'

import type { HomepageHotelGridSelection } from './hotelGridTypes'
import {
  areHotelSlotListsEqual,
  buildHotelGridSaveItems,
  mapHotelSelectionToSlots
} from './homepageHotelGridSlots.utils'

const selection: HomepageHotelGridSelection = {
  items: [
    {
      id: 7,
      slot: 2,
      title: 'Hotel Seven',
      slug: 'hotel-seven',
      type: null,
      priceLevel: null,
      status: 'published',
      updatedAt: null,
      imageUrl: null,
      location: null
    }
  ],
  invalidItems: [],
  isComplete: false,
  allowDrafts: true,
  totalSlots: 3
}

describe('homepage hotel grid slot utilities', () => {
  it('maps one-based saved positions into the fixed-size editor slots', () => {
    expect(
      mapHotelSelectionToSlots(selection).map((item) => item?.id ?? null)
    ).toEqual([null, 7, null])
  })

  it('compares slot identity and position', () => {
    const slots = mapHotelSelectionToSlots(selection)

    expect(areHotelSlotListsEqual([...slots], slots)).toBe(true)
    expect(areHotelSlotListsEqual([slots[1], null, null], slots)).toBe(false)
  })

  it('builds the compact persistence payload in display order', () => {
    const slots = mapHotelSelectionToSlots(selection)

    expect(buildHotelGridSaveItems(slots)).toEqual([{ id: 7 }])
  })
})

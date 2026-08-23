import { describe, expect, it, vi } from 'vitest'

import { useHomepageHotelGridActions } from './useHomepageHotelGridActions'
import type { HotelGridSlotValue } from './useHomepageHotelGridSlots'

describe('useHomepageHotelGridActions removal', () => {
  it('collapses slots above minimum and leaves a replacement slot at minimum', () => {
    let slots = [1, 2, 3, 4, 5] as unknown as HotelGridSlotValue[]
    const updateSlots = vi.fn((transform: (current: HotelGridSlotValue[]) => HotelGridSlotValue[]) => {
      slots = transform(slots)
    })
    const actions = useHomepageHotelGridActions({
      pickerSlotIndex: null,
      setPickerSlotIndex: vi.fn(),
      updateSlots,
      resetToSavedSlots: vi.fn()
    })

    actions.handleRemove(2, 4)
    expect(slots).toEqual([1, 2, 4, 5])

    actions.handleRemove(1, 4)
    expect(slots).toEqual([1, null, 4, 5])
  })
})

import type { HomepageHotelGridCandidate } from './hotelGridTypes'
import type { HotelGridSlotValue } from './homepageHotelGridSlots.types'

type UseHomepageHotelGridActionsOptions = {
  pickerSlotIndex: number | null
  setPickerSlotIndex: (value: number | null) => void
  updateSlots: (
    transform: (current: HotelGridSlotValue[]) => HotelGridSlotValue[]
  ) => void
  resetToSavedSlots: () => void
}

export function useHomepageHotelGridActions({
  pickerSlotIndex,
  setPickerSlotIndex,
  updateSlots,
  resetToSavedSlots
}: UseHomepageHotelGridActionsOptions) {
  function handleCandidatePick(candidate: HomepageHotelGridCandidate) {
    if (pickerSlotIndex === null) return
    updateSlots((current) => {
      const next = [...current]
      next[pickerSlotIndex] = candidate
      return next
    })
    setPickerSlotIndex(null)
  }

  function handleMove(slotIndex: number, direction: -1 | 1) {
    updateSlots((current) => {
      const nextIndex = slotIndex + direction
      if (nextIndex < 0 || nextIndex >= current.length) return current
      const next = [...current]
      const currentValue = next[slotIndex]
      next[slotIndex] = next[nextIndex]
      next[nextIndex] = currentValue
      return next
    })
  }

  function handleReorderAll(newSlots: HotelGridSlotValue[]) {
    updateSlots((current) => {
      if (newSlots.length !== current.length) return current
      return [...newSlots]
    })
  }

  function handleResizeSlotCount(slotCount: number) {
    if (slotCount < 0) return
    if (pickerSlotIndex !== null && pickerSlotIndex >= slotCount) {
      setPickerSlotIndex(null)
    }
    updateSlots((current) => {
      if (slotCount === current.length) return current
      if (slotCount < current.length) return current.slice(0, slotCount)

      return [
        ...current,
        ...Array.from({ length: slotCount - current.length }, () => null)
      ]
    })
  }

  function handleRemove(slotIndex: number, minimumSlotCount = 0) {
    setPickerSlotIndex(null)
    updateSlots((current) => {
      if (current.length > minimumSlotCount) {
        return current.filter((_, index) => index !== slotIndex)
      }

      const next = [...current]
      next[slotIndex] = null
      return next
    })
  }

  return {
    handleCandidatePick,
    handleMove,
    handleReorderAll,
    handleResizeSlotCount,
    handleRemove,
    handleReset: resetToSavedSlots
  }
}

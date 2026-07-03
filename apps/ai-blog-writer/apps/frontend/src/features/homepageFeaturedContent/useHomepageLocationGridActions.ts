import type { HomepageLocationGridCandidate } from './locationGridTypes'
import type { LocationGridSlotValue } from './homepageLocationGridSlots.utils'

type UseHomepageLocationGridActionsOptions = {
  pickerSlotIndex: number | null
  setPickerSlotIndex: (value: number | null) => void
  updateSlots: (
    transform: (current: LocationGridSlotValue[]) => LocationGridSlotValue[]
  ) => void
  resetToSavedSlots: () => void
}

export function useHomepageLocationGridActions({
  pickerSlotIndex,
  setPickerSlotIndex,
  updateSlots,
  resetToSavedSlots
}: UseHomepageLocationGridActionsOptions) {
  function handleCandidatePick(candidate: HomepageLocationGridCandidate) {
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

  function handleReorderAll(newSlots: LocationGridSlotValue[]) {
    updateSlots((current) => {
      if (newSlots.length !== current.length) return current
      return [...newSlots]
    })
  }

  function handleRemove(slotIndex: number) {
    updateSlots((current) => {
      const next = [...current]
      next[slotIndex] = null
      return next
    })
  }

  return {
    handleCandidatePick,
    handleMove,
    handleReorderAll,
    handleRemove,
    handleReset: resetToSavedSlots
  }
}

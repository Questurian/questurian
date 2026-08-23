import type { HomepageLocationGridCandidate } from './locationGridTypes'
import type { LocationGridSlotValue } from './homepageLocationGridSlots.utils'

type UseHomepageLocationGridActionsOptions = {
  pickerSlotIndex: number | null
  setPickerSlotIndex: (value: number | null) => void
  updateSlots: (transform: (current: LocationGridSlotValue[]) => LocationGridSlotValue[]) => void
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
      next[pickerSlotIndex] = { ...candidate, description: null }
      return next
    })

    setPickerSlotIndex(null)
  }

  function handleDescriptionChange(slotIndex: number, description: string) {
    updateSlots((current) => {
      const item = current[slotIndex]
      if (!item) return current

      const next = [...current]
      next[slotIndex] = { ...item, description }
      return next
    })
  }

  function handleKickerChange(slotIndex: number, kicker: string) {
    updateSlots((current) => {
      const item = current[slotIndex]
      if (!item) return current

      const next = [...current]
      next[slotIndex] = { ...item, kicker }
      return next
    })
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
    handleKickerChange,
    handleDescriptionChange,
    handleMove,
    handleReorderAll,
    handleRemove,
    handleReset: resetToSavedSlots
  }
}

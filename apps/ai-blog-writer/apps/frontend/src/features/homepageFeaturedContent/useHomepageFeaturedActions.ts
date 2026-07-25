import { useCallback } from 'react'

import type { HomepageFeaturedCandidate } from './types'
import type { SlotValue } from './homepageFeaturedSlots.types'

type UseHomepageFeaturedActionsOptions = {
  pickerSlotIndex: number | null
  setPickerSlotIndex: (value: number | null) => void
  setDraftSlots: (slots: SlotValue[]) => void
  setResultMessage: (message: string | null) => void
  updateSlots: (transform: (current: SlotValue[]) => SlotValue[]) => void
  resetToSavedSlots: () => void
}

export function useHomepageFeaturedActions({
  pickerSlotIndex,
  setPickerSlotIndex,
  setDraftSlots,
  setResultMessage,
  updateSlots,
  resetToSavedSlots
}: UseHomepageFeaturedActionsOptions) {
  function handleCandidatePick(candidate: HomepageFeaturedCandidate) {
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

  function handleRemove(slotIndex: number) {
    updateSlots((current) => {
      const next = [...current]
      next[slotIndex] = null
      return next
    })
  }

  const handleReorderAll = useCallback(
    (newSlots: SlotValue[]) => {
      setDraftSlots(newSlots)
      setResultMessage(null)
    },
    [setDraftSlots, setResultMessage]
  )

  return {
    handleCandidatePick,
    handleMove,
    handleRemove,
    handleReorderAll,
    handleReset: resetToSavedSlots
  }
}

import { useCallback, useLayoutEffect, useRef, useState } from 'react'

import type {
  HomepageHotelGridInvalidItem,
  HomepageHotelGridSelection
} from './hotelGridTypes'
import type { HotelGridSlotValue } from './homepageHotelGridSlots.types'
import { mapHotelSelectionToSlots } from './homepageHotelGridSlots.utils'

export function useHomepageHotelGridDraftSlots(
  selection: HomepageHotelGridSelection,
  selectionQueryKey: unknown[]
) {
  const [draftSlots, setDraftSlots] = useState<HotelGridSlotValue[] | null>(
    null
  )
  const [savedSlots, setSavedSlots] = useState<HotelGridSlotValue[]>([])
  const [savedInvalidItems, setSavedInvalidItems] = useState<
    HomepageHotelGridInvalidItem[]
  >([])
  const [pickerSlotIndex, setPickerSlotIndex] = useState<number | null>(null)
  const [resultMessage, setResultMessage] = useState<string | null>(null)

  const selectionKeyJson = JSON.stringify(selectionQueryKey)
  const previousSelectionKeyRef = useRef<string | null>(null)
  const previousSelectionRef = useRef<HomepageHotelGridSelection | null>(null)

  const applySelection = useCallback(
    (nextSelection: HomepageHotelGridSelection) => {
      const nextSlots = mapHotelSelectionToSlots(nextSelection)
      setSavedSlots(nextSlots)
      setDraftSlots(nextSlots)
      setSavedInvalidItems(nextSelection.invalidItems)
      setPickerSlotIndex(null)
    },
    []
  )

  useLayoutEffect(() => {
    if (
      previousSelectionKeyRef.current === selectionKeyJson &&
      previousSelectionRef.current === selection
    ) {
      return
    }
    previousSelectionKeyRef.current = selectionKeyJson
    previousSelectionRef.current = selection
    applySelection(selection)
  }, [applySelection, selection, selectionKeyJson])

  const updateSlots = useCallback(
    (transform: (current: HotelGridSlotValue[]) => HotelGridSlotValue[]) => {
      setDraftSlots((current) => {
        const base = current ?? savedSlots
        return transform([...base])
      })
      setResultMessage(null)
    },
    [savedSlots]
  )

  const resetToSavedSlots = useCallback(() => {
    setDraftSlots([...savedSlots])
    setPickerSlotIndex(null)
    setResultMessage('Local changes discarded. Restored saved hotel selection.')
  }, [savedSlots])

  return {
    draftSlots,
    savedSlots,
    savedInvalidItems,
    pickerSlotIndex,
    resultMessage,
    setPickerSlotIndex,
    setResultMessage,
    applySelection,
    updateSlots,
    resetToSavedSlots
  }
}

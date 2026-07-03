import { useLayoutEffect, useRef, useState } from 'react'

import type {
  HomepageLocationGridInvalidItem,
  HomepageLocationGridSelection
} from './locationGridTypes'
import {
  mapSelectionToSlots,
  type LocationGridSlotValue
} from './homepageLocationGridSlots.utils'

export function useHomepageLocationGridDraftSlots(
  selection: HomepageLocationGridSelection,
  selectionQueryKey: unknown[]
) {
  const [draftSlots, setDraftSlots] = useState<LocationGridSlotValue[] | null>(
    null
  )
  const [savedSlots, setSavedSlots] = useState<LocationGridSlotValue[]>([])
  const [savedInvalidItems, setSavedInvalidItems] = useState<
    HomepageLocationGridInvalidItem[]
  >([])
  const [pickerSlotIndex, setPickerSlotIndex] = useState<number | null>(null)
  const [resultMessage, setResultMessage] = useState<string | null>(null)

  const selectionKeyJson = JSON.stringify(selectionQueryKey)
  const prevSelectionKeyJsonRef = useRef<string | null>(null)
  const prevSelectionRef = useRef<HomepageLocationGridSelection | null>(null)

  function applySelection(nextSelection: HomepageLocationGridSelection) {
    const nextSlots = mapSelectionToSlots(nextSelection)
    setSavedSlots(nextSlots)
    setDraftSlots(nextSlots)
    setSavedInvalidItems(nextSelection.invalidItems)
    setPickerSlotIndex(null)
  }

  useLayoutEffect(() => {
    if (
      prevSelectionKeyJsonRef.current === selectionKeyJson &&
      prevSelectionRef.current === selection
    ) {
      return
    }
    prevSelectionKeyJsonRef.current = selectionKeyJson
    prevSelectionRef.current = selection
    applySelection(selection)
  }, [selection, selectionKeyJson])

  function updateSlots(
    transform: (current: LocationGridSlotValue[]) => LocationGridSlotValue[]
  ) {
    setDraftSlots((current) => {
      const base = current ?? savedSlots
      return transform([...base])
    })
    setResultMessage(null)
  }

  function resetToSavedSlots() {
    setDraftSlots([...savedSlots])
    setPickerSlotIndex(null)
    setResultMessage(
      'Local changes discarded. Restored saved homepage location grid.'
    )
  }

  return {
    draftSlots,
    savedSlots,
    savedInvalidItems,
    pickerSlotIndex,
    resultMessage,
    setDraftSlots,
    setSavedSlots,
    setSavedInvalidItems,
    setPickerSlotIndex,
    setResultMessage,
    applySelection,
    updateSlots,
    resetToSavedSlots
  }
}

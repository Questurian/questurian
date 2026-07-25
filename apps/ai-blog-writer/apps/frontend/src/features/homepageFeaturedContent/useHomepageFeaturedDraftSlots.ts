import { useCallback, useLayoutEffect, useRef, useState } from 'react'

import type {
  HomepageFeaturedInvalidItem,
  HomepageFeaturedSelection
} from './types'
import type { SlotValue } from './homepageFeaturedSlots.types'
import { mapSelectionToSlots } from './homepageFeaturedSlots.utils'

export function useHomepageFeaturedDraftSlots(
  selection: HomepageFeaturedSelection,
  selectionQueryKey: unknown[]
) {
  const [draftSlots, setDraftSlots] = useState<SlotValue[] | null>(null)
  const [savedSlots, setSavedSlots] = useState<SlotValue[]>([])
  const [savedInvalidItems, setSavedInvalidItems] = useState<
    HomepageFeaturedInvalidItem[]
  >([])
  const [pickerSlotIndex, setPickerSlotIndex] = useState<number | null>(null)
  const [resultMessage, setResultMessage] = useState<string | null>(null)

  const selectionKeyJson = JSON.stringify(selectionQueryKey)
  const prevSelectionKeyJsonRef = useRef<string | null>(null)
  const prevSelectionRef = useRef<HomepageFeaturedSelection | null>(null)

  const applySelection = useCallback(
    (nextSelection: HomepageFeaturedSelection) => {
      const nextSlots = mapSelectionToSlots(nextSelection)
      setSavedSlots(nextSlots)
      setDraftSlots(nextSlots)
      setSavedInvalidItems(nextSelection.invalidItems)
      setPickerSlotIndex(null)
    },
    []
  )

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
  }, [applySelection, selection, selectionKeyJson])

  const updateSlots = useCallback(
    (transform: (current: SlotValue[]) => SlotValue[]) => {
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
    setResultMessage(
      'Local changes discarded. Restored saved homepage selection.'
    )
  }, [savedSlots])

  return {
    draftSlots,
    savedSlots,
    savedInvalidItems,
    pickerSlotIndex,
    resultMessage,
    setDraftSlots,
    setPickerSlotIndex,
    setResultMessage,
    applySelection,
    updateSlots,
    resetToSavedSlots
  }
}

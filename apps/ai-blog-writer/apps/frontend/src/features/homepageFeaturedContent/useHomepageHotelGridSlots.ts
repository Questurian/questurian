import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'

import type { HomepageHotelGridSelection } from './hotelGridTypes'
import type {
  UseHomepageHotelGridSlotsOptions,
  UseHomepageHotelGridSlotsResult
} from './homepageHotelGridSlots.types'
import {
  areHotelSlotListsEqual,
  buildHotelGridSaveItems,
  mapHotelInvalidItemsBySlot
} from './homepageHotelGridSlots.utils'
import { useHomepageHotelGridActions } from './useHomepageHotelGridActions'
import { useHomepageHotelGridCandidates } from './useHomepageHotelGridCandidates'
import { useHomepageHotelGridDraftSlots } from './useHomepageHotelGridDraftSlots'
import { useHomepageHotelGridSaveMutation } from './useHomepageHotelGridSaveMutation'

export type {
  HotelGridCandidateParams,
  HotelGridSlotValue,
  UseHomepageHotelGridSlotsOptions,
  UseHomepageHotelGridSlotsResult
} from './homepageHotelGridSlots.types'

export function useHomepageHotelGridSlots(
  options: UseHomepageHotelGridSlotsOptions
): UseHomepageHotelGridSlotsResult {
  const {
    token,
    canManage,
    selection,
    saveSelection,
    fetchCandidates,
    selectionQueryKey
  } = options
  const draftState = useHomepageHotelGridDraftSlots(
    selection,
    selectionQueryKey
  )
  const {
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
  } = draftState

  const selectionQuery = {
    data: selection,
    error: null,
    isLoading: false,
    isPending: false,
    isFetching: false
  } as ReturnType<typeof useQuery<HomepageHotelGridSelection>>

  const candidateState = useHomepageHotelGridCandidates({
    token,
    canManage,
    fetchCandidates,
    selectionQueryKey,
    pickerSlotIndex
  })

  const slots = draftSlots ?? savedSlots
  const currentSaveSlotCountRef = useRef(selection.totalSlots)

  useEffect(() => {
    currentSaveSlotCountRef.current = slots.length
  }, [slots.length])

  const saveMutation = useHomepageHotelGridSaveMutation({
    token,
    saveSelection,
    slotCountRef: currentSaveSlotCountRef,
    onSuccess: (nextSelection) => {
      applySelection(nextSelection)
      setResultMessage('Homepage hotel grid saved.')
    },
    onError: (error) => {
      setResultMessage(
        error instanceof Error
          ? error.message
          : 'Failed to save homepage hotel grid.'
      )
    }
  })

  const hasUnsavedChanges = !areHotelSlotListsEqual(draftSlots, savedSlots)
  const saveDisabled =
    !token ||
    slots.some((item) => item === null) ||
    saveMutation.isPending ||
    !hasUnsavedChanges
  const actions = useHomepageHotelGridActions({
    pickerSlotIndex,
    setPickerSlotIndex,
    updateSlots,
    resetToSavedSlots
  })

  function handleSave() {
    if (saveDisabled) return
    saveMutation.mutate(buildHotelGridSaveItems(slots))
  }

  return {
    selectionQuery,
    candidatesQuery: candidateState.candidatesQuery,
    saveMutation,
    slots,
    savedSlots,
    draftSlots,
    savedInvalidItems,
    pickerSlotIndex,
    usedIds: new Set(slots.flatMap((item) => (item ? [item.id] : []))),
    hasUnsavedChanges,
    saveDisabled,
    invalidItemsBySlot: mapHotelInvalidItemsBySlot(savedInvalidItems),
    resultMessage,
    searchValue: candidateState.searchValue,
    candidatePage: candidateState.candidatePage,
    ...actions,
    handleSave,
    setSearchValue: candidateState.setSearchValue,
    setCandidatePage: candidateState.setCandidatePage,
    setPickerSlotIndex
  }
}

import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import type {
  HomepageLocationGridInvalidItem,
  HomepageLocationGridSelection
} from './locationGridTypes'
import type {
  UseHomepageLocationGridSlotsOptions,
  UseHomepageLocationGridSlotsResult
} from './homepageLocationGridSlots.types'
import {
  areSlotListsEqual,
  buildSaveItems,
  hasCompleteDescriptions,
  hasCompleteKickers,
  hasDuplicateSlots,
  invalidItemsBySlotMap
} from './homepageLocationGridSlots.utils'
import { useHomepageLocationGridActions } from './useHomepageLocationGridActions'
import { useHomepageLocationGridCandidates } from './useHomepageLocationGridCandidates'
import { useHomepageLocationGridDraftSlots } from './useHomepageLocationGridDraftSlots'
import { useHomepageLocationGridSaveMutation } from './useHomepageLocationGridSaveMutation'

export type { LocationGridSlotValue } from './homepageLocationGridSlots.utils'
export type {
  LocationGridCandidateParams,
  UseHomepageLocationGridSlotsOptions,
  UseHomepageLocationGridSlotsResult
} from './homepageLocationGridSlots.types'
export {
  buildSaveItems,
  hasDuplicateSlots
} from './homepageLocationGridSlots.utils'

export function useHomepageLocationGridSlots(
  options: UseHomepageLocationGridSlotsOptions
): UseHomepageLocationGridSlotsResult {
  const {
    canManage,
    selection,
    saveSelection,
    fetchCandidates,
    selectionQueryKey
  } = options

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
  } = useHomepageLocationGridDraftSlots(selection, selectionQueryKey)

  const selectionQuery = {
    data: selection,
    error: null,
    isLoading: false,
    isPending: false,
    isFetching: false
  } as ReturnType<typeof useQuery<HomepageLocationGridSelection>>

  const {
    searchValue,
    candidatePage,
    candidatesQuery,
    setSearchValue,
    setCandidatePage
  } = useHomepageLocationGridCandidates({
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

  const saveMutation = useHomepageLocationGridSaveMutation({
    saveSelection,
    slotCountRef: currentSaveSlotCountRef,
    onSuccess: (selection) => {
      applySelection(selection)
      setResultMessage('Homepage location grid saved.')
    },
    onError: (error: unknown) => {
      setResultMessage(
        error instanceof Error
          ? error.message
          : 'Failed to save homepage location grid.'
      )
    }
  })

  const usedIds = new Set(slots.flatMap((item) => (item ? [item.id] : [])))
  const hasAllSlotsFilled = slots.every((item) => item !== null)
  const descriptionsComplete = hasCompleteDescriptions(slots)
  const kickersComplete = hasCompleteKickers(slots)
  const hasUnsavedChanges = areSlotListsEqual(draftSlots, savedSlots) === false
  const saveDisabled =
    !hasAllSlotsFilled ||
    !kickersComplete ||
    !descriptionsComplete ||
    hasDuplicateSlots(slots) ||
    saveMutation.isPending ||
    !hasUnsavedChanges

  const invalidItemsBySlot =
    invalidItemsBySlotMap<HomepageLocationGridInvalidItem>(savedInvalidItems)
  const actions = useHomepageLocationGridActions({
    pickerSlotIndex,
    setPickerSlotIndex,
    updateSlots,
    resetToSavedSlots
  })

  function handleSave() {
    if (saveDisabled) return
    saveMutation.mutate(buildSaveItems(slots))
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

  return {
    selectionQuery,
    candidatesQuery,
    saveMutation,
    slots,
    savedSlots,
    draftSlots,
    savedInvalidItems,
    pickerSlotIndex,
    usedIds,
    hasAllSlotsFilled,
    hasCompleteKickers: kickersComplete,
    hasCompleteDescriptions: descriptionsComplete,
    hasUnsavedChanges,
    saveDisabled,
    invalidItemsBySlot,
    resultMessage,
    searchValue,
    candidatePage,
    ...actions,
    handleResizeSlotCount,
    handleSave,
    setSearchValue,
    setCandidatePage,
    setPickerSlotIndex
  }
}

import { useQuery } from '@tanstack/react-query'

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
export { buildSaveItems, hasDuplicateSlots } from './homepageLocationGridSlots.utils'

export function useHomepageLocationGridSlots(
  options: UseHomepageLocationGridSlotsOptions
): UseHomepageLocationGridSlotsResult {
  const {
    token,
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
    token,
    canManage,
    fetchCandidates,
    selectionQueryKey,
    pickerSlotIndex
  })

  const saveMutation = useHomepageLocationGridSaveMutation({
    token,
    saveSelection,
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

  const slots = draftSlots ?? savedSlots
  const usedIds = new Set(slots.flatMap((item) => (item ? [item.id] : [])))
  const hasAllSlotsFilled = slots.every((item) => item !== null)
  const hasUnsavedChanges = areSlotListsEqual(draftSlots, savedSlots) === false
  const saveDisabled =
    !token ||
    !hasAllSlotsFilled ||
    hasDuplicateSlots(slots) ||
    saveMutation.isPending ||
    !hasUnsavedChanges

  const invalidItemsBySlot = invalidItemsBySlotMap<HomepageLocationGridInvalidItem>(savedInvalidItems)
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
    hasUnsavedChanges,
    saveDisabled,
    invalidItemsBySlot,
    resultMessage,
    searchValue,
    candidatePage,
    ...actions,
    handleSave,
    setSearchValue,
    setCandidatePage,
    setPickerSlotIndex
  }
}

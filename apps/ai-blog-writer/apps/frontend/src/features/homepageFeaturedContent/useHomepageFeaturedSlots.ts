import { useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'

import type {
  HomepageFeaturedInvalidItem,
  HomepageFeaturedSelection
} from './types'
import type {
  UseHomepageFeaturedSlotsOptions,
  UseHomepageFeaturedSlotsResult
} from './homepageFeaturedSlots.types'
import {
  areSlotListsEqual,
  buildSaveItems,
  hasDuplicateSlots
} from './homepageFeaturedSlots.utils'
import { useHomepageFeaturedActions } from './useHomepageFeaturedActions'
import { useHomepageFeaturedCandidates } from './useHomepageFeaturedCandidates'
import { useHomepageFeaturedDraftSlots } from './useHomepageFeaturedDraftSlots'
import { useHomepageFeaturedSaveMutation } from './useHomepageFeaturedSaveMutation'

export type {
  CandidateParams,
  SaveNotification,
  SlotValue,
  UseHomepageFeaturedSlotsOptions,
  UseHomepageFeaturedSlotsResult
} from './homepageFeaturedSlots.types'
export {
  buildSaveItems,
  hasDuplicateSlots
} from './homepageFeaturedSlots.utils'

export function useHomepageFeaturedSlots(
  options: UseHomepageFeaturedSlotsOptions
): UseHomepageFeaturedSlotsResult {
  const {
    canManage,
    selection,
    saveSelection,
    fetchCandidates,
    selectionQueryKey,
    lockedCollectionFilter,
    repairSlotCount
  } = options

  const {
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
  } = useHomepageFeaturedDraftSlots(selection, selectionQueryKey)

  const selectionQuery = {
    data: selection,
    error: null,
    isLoading: false,
    isPending: false,
    isFetching: false
  } as ReturnType<typeof useQuery<HomepageFeaturedSelection>>

  const {
    searchValue,
    collectionFilter,
    effectiveCollectionFilter,
    candidatePage,
    candidatesQuery,
    setSearchValue,
    setCollectionFilter,
    setCandidatePage
  } = useHomepageFeaturedCandidates({
    canManage,
    fetchCandidates,
    selectionQueryKey,
    lockedCollectionFilter,
    pickerSlotIndex
  })

  const slots = draftSlots ?? savedSlots
  const currentSaveSlotCountRef = useRef(selection.totalSlots)

  useEffect(() => {
    currentSaveSlotCountRef.current = repairSlotCount ?? slots.length
  }, [repairSlotCount, slots.length])

  const { saveMutation, saveNotification } = useHomepageFeaturedSaveMutation({
    saveSelection,
    slotCountRef: currentSaveSlotCountRef,
    onSuccess: applySelection,
    onResultMessage: setResultMessage
  })

  const saveItems = buildSaveItems(slots)
  // Consumers place usedKeys in effect deps (e.g. CuratedHomepageBlockEditor
  // reports it to the page); an unstable identity there re-fires those effects
  // on every render and can feed back into an infinite render loop.
  const usedKeys = useMemo(
    () =>
      new Set(
        slots.flatMap((item) => (item ? [`${item.relationTo}:${item.id}`] : []))
      ),
    [slots]
  )
  const hasAllSlotsFilled = slots.every((item) => item !== null)
  const hasUnsavedChanges = areSlotListsEqual(draftSlots, savedSlots) === false
  const hasRepairableStaleSlots =
    typeof repairSlotCount === 'number' &&
    savedInvalidItems.length > 0 &&
    saveItems.length === repairSlotCount
  const saveDisabled =
    (!hasAllSlotsFilled && !hasRepairableStaleSlots) ||
    hasDuplicateSlots(slots) ||
    saveMutation.isPending ||
    (!hasUnsavedChanges && !hasRepairableStaleSlots)

  const invalidItemsBySlot = new Map<number, HomepageFeaturedInvalidItem>()
  for (const item of savedInvalidItems) {
    invalidItemsBySlot.set(item.slot, item)
  }

  const mutate = saveMutation.mutate

  useEffect(() => {
    if (saveDisabled) return
    const timer = setTimeout(() => {
      mutate(saveItems)
    }, 800)
    return () => clearTimeout(timer)
  }, [saveDisabled, draftSlots, mutate]) // eslint-disable-line react-hooks/exhaustive-deps

  const actions = useHomepageFeaturedActions({
    pickerSlotIndex,
    setPickerSlotIndex,
    setDraftSlots,
    setResultMessage,
    updateSlots,
    resetToSavedSlots
  })

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

  function handleSave() {
    if (saveDisabled) return
    saveMutation.mutate(saveItems)
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
    usedKeys,
    hasAllSlotsFilled,
    hasUnsavedChanges,
    saveDisabled,
    invalidItemsBySlot,
    resultMessage,
    saveNotification,
    repairSlotCount,
    searchValue,
    collectionFilter,
    effectiveCollectionFilter,
    lockedCollectionFilter,
    candidatePage,
    ...actions,
    handleResizeSlotCount,
    handleSave,
    setSearchValue,
    setCollectionFilter,
    setCandidatePage,
    setPickerSlotIndex
  }
}

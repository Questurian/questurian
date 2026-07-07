import { useDeferredValue, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'

import type {
  HomepageFeaturedCandidate,
  HomepageFeaturedCollection,
  HomepageFeaturedInvalidItem,
  HomepageFeaturedItemRef,
  HomepageFeaturedSelection,
} from './types'
import type {
  SaveNotification,
  SlotValue,
  UseHomepageFeaturedSlotsOptions,
  UseHomepageFeaturedSlotsResult,
} from './homepageFeaturedSlots.types'
import {
  areSlotListsEqual,
  buildSaveItems,
  hasDuplicateSlots,
  mapSelectionToSlots,
} from './homepageFeaturedSlots.utils'

export type {
  CandidateParams,
  SaveNotification,
  SlotValue,
  UseHomepageFeaturedSlotsOptions,
  UseHomepageFeaturedSlotsResult,
} from './homepageFeaturedSlots.types'
export { buildSaveItems, hasDuplicateSlots } from './homepageFeaturedSlots.utils'

const CANDIDATE_PAGE_SIZE = 24

export function useHomepageFeaturedSlots(
  options: UseHomepageFeaturedSlotsOptions,
): UseHomepageFeaturedSlotsResult {
  const {
    token,
    canManage,
    selection,
    saveSelection,
    fetchCandidates,
    selectionQueryKey,
    lockedCollectionFilter,
    repairSlotCount,
  } = options

  const [searchValue, setSearchValue] = useState('')
  const deferredSearchValue = useDeferredValue(searchValue.trim())
  const [collectionFilter, setCollectionFilter] = useState<HomepageFeaturedCollection | 'all'>(
    lockedCollectionFilter ?? 'all',
  )
  const [candidatePage, setCandidatePage] = useState(1)
  const [draftSlots, setDraftSlots] = useState<SlotValue[] | null>(null)
  const [savedSlots, setSavedSlots] = useState<SlotValue[]>([])
  const [savedInvalidItems, setSavedInvalidItems] = useState<HomepageFeaturedInvalidItem[]>([])
  const [pickerSlotIndex, setPickerSlotIndex] = useState<number | null>(null)
  const [resultMessage, setResultMessage] = useState<string | null>(null)
  const [saveNotification, setSaveNotification] = useState<SaveNotification | null>(null)

  const selectionKeyJson = JSON.stringify(selectionQueryKey)
  const prevSelectionKeyJsonRef = useRef<string | null>(null)
  const prevSelectionRef = useRef<HomepageFeaturedSelection | null>(null)

  useLayoutEffect(() => {
    if (
      prevSelectionKeyJsonRef.current === selectionKeyJson
      && prevSelectionRef.current === selection
    ) {
      return
    }
    prevSelectionKeyJsonRef.current = selectionKeyJson
    prevSelectionRef.current = selection
    const nextSlots = mapSelectionToSlots(selection)
    setDraftSlots(nextSlots)
    setSavedSlots(nextSlots)
    setSavedInvalidItems(selection.invalidItems)
    setPickerSlotIndex(null)
  }, [selection, selectionKeyJson])

  const selectionQuery = {
    data: selection,
    error: null,
    isLoading: false,
    isPending: false,
    isFetching: false,
  } as ReturnType<typeof useQuery<HomepageFeaturedSelection>>

  useEffect(() => {
    setCandidatePage(1)
  }, [collectionFilter, deferredSearchValue])

  const effectiveCollectionFilter = lockedCollectionFilter ?? collectionFilter

  const candidatesQuery = useQuery({
    queryKey: [
      ...selectionQueryKey,
      'candidates',
      effectiveCollectionFilter,
      deferredSearchValue,
      candidatePage,
    ],
    queryFn: () =>
      fetchCandidates(token!, {
        type: effectiveCollectionFilter,
        query: deferredSearchValue || undefined,
        page: candidatePage,
        limit: CANDIDATE_PAGE_SIZE,
      }),
    enabled: Boolean(token && canManage && pickerSlotIndex !== null),
    placeholderData: (previousData) => previousData,
  })

  const slots = draftSlots ?? savedSlots
  const currentSaveSlotCountRef = useRef(selection.totalSlots)

  useEffect(() => {
    currentSaveSlotCountRef.current = repairSlotCount ?? slots.length
  }, [repairSlotCount, slots.length])

  const saveMutation = useMutation({
    mutationFn: (items: HomepageFeaturedItemRef[]) =>
      saveSelection(token!, items, currentSaveSlotCountRef.current),
    onSuccess: (selection) => {
      const nextSlots = mapSelectionToSlots(selection)
      setSavedSlots(nextSlots)
      setDraftSlots(nextSlots)
      setSavedInvalidItems(selection.invalidItems)
      setPickerSlotIndex(null)
      setResultMessage('Homepage featured content saved.')
      setSaveNotification({ message: 'Saved', type: 'success', seq: Date.now() })
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : 'Failed to save homepage featured content.'
      setResultMessage(msg)
      setSaveNotification({ message: 'Save failed', type: 'error', seq: Date.now() })
    },
  })

  const saveItems = buildSaveItems(slots)
  const usedKeys = new Set(
    slots.flatMap((item) => (item ? [`${item.relationTo}:${item.id}`] : [])),
  )
  const hasAllSlotsFilled = slots.every((item) => item !== null)
  const hasUnsavedChanges = areSlotListsEqual(draftSlots, savedSlots) === false
  const hasRepairableStaleSlots =
    typeof repairSlotCount === 'number' &&
    savedInvalidItems.length > 0 &&
    saveItems.length === repairSlotCount
  const saveDisabled =
    !token ||
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

  function updateSlots(transform: (current: SlotValue[]) => SlotValue[]) {
    setDraftSlots((current) => {
      const base = current ?? savedSlots
      return transform([...base])
    })
    setResultMessage(null)
  }

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

  const handleReorderAll = useCallback((newSlots: SlotValue[]) => {
    setDraftSlots(newSlots)
    setResultMessage(null)
  }, [])

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
        ...Array.from({ length: slotCount - current.length }, () => null),
      ]
    })
  }

  function handleReset() {
    setDraftSlots([...savedSlots])
    setPickerSlotIndex(null)
    setResultMessage('Local changes discarded. Restored saved homepage selection.')
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
    handleCandidatePick,
    handleMove,
    handleRemove,
    handleReorderAll,
    handleResizeSlotCount,
    handleReset,
    handleSave,
    setSearchValue,
    setCollectionFilter,
    setCandidatePage,
    setPickerSlotIndex,
  }
}

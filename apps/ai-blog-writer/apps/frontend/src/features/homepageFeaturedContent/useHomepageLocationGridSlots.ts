import { useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type {
  HomepageLocationGridCandidate,
  HomepageLocationGridCandidatesResponse,
  HomepageLocationGridInvalidItem,
  HomepageLocationGridItemRef,
  HomepageLocationGridSelection,
} from './locationGridTypes'

const CANDIDATE_PAGE_SIZE = 24

export type LocationGridSlotValue = HomepageLocationGridCandidate | null

function createEmptySlots(count: number): LocationGridSlotValue[] {
  return Array.from({ length: count }, () => null)
}

function mapSelectionToSlots(selection: HomepageLocationGridSelection): LocationGridSlotValue[] {
  const slots = createEmptySlots(selection.totalSlots)

  for (const item of selection.items) {
    if (!item.slot) continue
    const slotIndex = item.slot - 1
    if (slotIndex < 0 || slotIndex >= slots.length) continue
    slots[slotIndex] = item
  }

  return slots
}

function areRefsEqual(left: LocationGridSlotValue, right: LocationGridSlotValue): boolean {
  if (!left && !right) return true
  if (!left || !right) return false

  return left.id === right.id
}

function areSlotListsEqual(
  left: LocationGridSlotValue[] | null,
  right: LocationGridSlotValue[],
): boolean {
  if (!left) return false

  return left.length === right.length && left.every((item, index) => areRefsEqual(item, right[index]))
}

export function hasDuplicateSlots(slots: LocationGridSlotValue[]): boolean {
  const ids = new Set<number>()

  for (const item of slots) {
    if (!item) continue

    if (ids.has(item.id)) return true
    ids.add(item.id)
  }

  return false
}

export function buildSaveItems(slots: LocationGridSlotValue[]): HomepageLocationGridItemRef[] {
  return slots.flatMap((item) => {
    if (!item) return []

    return [{ id: item.id }]
  })
}

export type LocationGridCandidateParams = {
  query?: string
  page?: number
  limit?: number
}

export type UseHomepageLocationGridSlotsOptions = {
  token: string | null
  canManage: boolean
  fetchSelection: (token: string) => Promise<HomepageLocationGridSelection>
  saveSelection: (
    token: string,
    items: HomepageLocationGridItemRef[],
  ) => Promise<HomepageLocationGridSelection>
  fetchCandidates: (
    token: string,
    params: LocationGridCandidateParams,
  ) => Promise<HomepageLocationGridCandidatesResponse>
  selectionQueryKey: unknown[]
}

export type UseHomepageLocationGridSlotsResult = {
  selectionQuery: ReturnType<typeof useQuery<HomepageLocationGridSelection>>
  candidatesQuery: ReturnType<typeof useQuery<HomepageLocationGridCandidatesResponse>>
  saveMutation: ReturnType<
    typeof useMutation<HomepageLocationGridSelection, unknown, HomepageLocationGridItemRef[]>
  >
  slots: LocationGridSlotValue[]
  savedSlots: LocationGridSlotValue[]
  draftSlots: LocationGridSlotValue[] | null
  savedInvalidItems: HomepageLocationGridInvalidItem[]
  pickerSlotIndex: number | null
  usedIds: Set<number>
  hasAllSlotsFilled: boolean
  hasUnsavedChanges: boolean
  saveDisabled: boolean
  invalidItemsBySlot: Map<number, HomepageLocationGridInvalidItem>
  resultMessage: string | null
  searchValue: string
  candidatePage: number
  handleCandidatePick: (candidate: HomepageLocationGridCandidate) => void
  handleMove: (slotIndex: number, direction: -1 | 1) => void
  handleRemove: (slotIndex: number) => void
  handleReset: () => void
  handleSave: () => void
  setSearchValue: (v: string) => void
  setCandidatePage: (v: number | ((prev: number) => number)) => void
  setPickerSlotIndex: (v: number | null) => void
}

export function useHomepageLocationGridSlots(
  options: UseHomepageLocationGridSlotsOptions,
): UseHomepageLocationGridSlotsResult {
  const { token, canManage, fetchSelection, saveSelection, fetchCandidates, selectionQueryKey } =
    options

  const queryClient = useQueryClient()
  const [searchValue, setSearchValue] = useState('')
  const deferredSearchValue = useDeferredValue(searchValue.trim())
  const [candidatePage, setCandidatePage] = useState(1)
  const [draftSlots, setDraftSlots] = useState<LocationGridSlotValue[] | null>(null)
  const [savedSlots, setSavedSlots] = useState<LocationGridSlotValue[]>([])
  const [savedInvalidItems, setSavedInvalidItems] = useState<HomepageLocationGridInvalidItem[]>([])
  const [pickerSlotIndex, setPickerSlotIndex] = useState<number | null>(null)
  const [resultMessage, setResultMessage] = useState<string | null>(null)

  const selectionKeyJson = JSON.stringify(selectionQueryKey)
  const prevSelectionKeyJsonRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    if (prevSelectionKeyJsonRef.current === selectionKeyJson) return
    prevSelectionKeyJsonRef.current = selectionKeyJson
    setDraftSlots(null)
    setSavedSlots([])
    setSavedInvalidItems([])
    setPickerSlotIndex(null)
  }, [selectionKeyJson])

  const selectionQuery = useQuery({
    queryKey: selectionQueryKey,
    queryFn: () => fetchSelection(token!),
    enabled: Boolean(token && canManage),
  })

  useEffect(() => {
    if (!selectionQuery.data || draftSlots !== null) return

    const nextSlots = mapSelectionToSlots(selectionQuery.data)
    setSavedSlots(nextSlots)
    setDraftSlots(nextSlots)
    setSavedInvalidItems(selectionQuery.data.invalidItems)
  }, [draftSlots, selectionQuery.data])

  useEffect(() => {
    setCandidatePage(1)
  }, [deferredSearchValue])

  const candidatesQuery = useQuery({
    queryKey: [...selectionQueryKey, 'location-candidates', deferredSearchValue, candidatePage],
    queryFn: () =>
      fetchCandidates(token!, {
        query: deferredSearchValue || undefined,
        page: candidatePage,
        limit: CANDIDATE_PAGE_SIZE,
      }),
    enabled: Boolean(token && canManage),
    placeholderData: (previousData) => previousData,
  })

  const saveMutation = useMutation({
    mutationFn: (items: HomepageLocationGridItemRef[]) => saveSelection(token!, items),
    onSuccess: (selection) => {
      const nextSlots = mapSelectionToSlots(selection)
      setSavedSlots(nextSlots)
      setDraftSlots(nextSlots)
      setSavedInvalidItems(selection.invalidItems)
      setPickerSlotIndex(null)
      setResultMessage('Homepage location grid saved.')
      queryClient.setQueryData(selectionQueryKey, selection)
    },
    onError: (error: unknown) => {
      setResultMessage(
        error instanceof Error ? error.message : 'Failed to save homepage location grid.',
      )
    },
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

  const invalidItemsBySlot = new Map<number, HomepageLocationGridInvalidItem>()
  for (const item of savedInvalidItems) {
    invalidItemsBySlot.set(item.slot, item)
  }

  function updateSlots(transform: (current: LocationGridSlotValue[]) => LocationGridSlotValue[]) {
    setDraftSlots((current) => {
      const base = current ?? savedSlots
      return transform([...base])
    })
    setResultMessage(null)
  }

  function handleCandidatePick(candidate: HomepageLocationGridCandidate) {
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

  function handleReset() {
    setDraftSlots([...savedSlots])
    setPickerSlotIndex(null)
    setResultMessage('Local changes discarded. Restored saved homepage location grid.')
  }

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
    handleCandidatePick,
    handleMove,
    handleRemove,
    handleReset,
    handleSave,
    setSearchValue,
    setCandidatePage,
    setPickerSlotIndex,
  }
}

import { useDeferredValue, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type {
  HomepageFeaturedCandidate,
  HomepageFeaturedCandidatesResponse,
  HomepageFeaturedCollection,
  HomepageFeaturedInvalidItem,
  HomepageFeaturedItemRef,
  HomepageFeaturedSelection,
} from './types'

const CANDIDATE_PAGE_SIZE = 24

export type SlotValue = HomepageFeaturedCandidate | null

function createEmptySlots(count: number): SlotValue[] {
  return Array.from({ length: count }, () => null)
}

function mapSelectionToSlots(selection: HomepageFeaturedSelection): SlotValue[] {
  const slots = createEmptySlots(selection.totalSlots)

  for (const item of selection.items) {
    if (!item.slot) continue
    const slotIndex = item.slot - 1
    if (slotIndex < 0 || slotIndex >= slots.length) continue
    slots[slotIndex] = item
  }

  return slots
}

function areRefsEqual(left: SlotValue, right: SlotValue): boolean {
  if (!left && !right) return true
  if (!left || !right) return false

  return left.id === right.id && left.relationTo === right.relationTo
}

function areSlotListsEqual(left: SlotValue[] | null, right: SlotValue[]): boolean {
  if (!left) return false

  return left.length === right.length && left.every((item, index) => areRefsEqual(item, right[index]))
}

export function hasDuplicateSlots(slots: SlotValue[]): boolean {
  const keys = new Set<string>()

  for (const item of slots) {
    if (!item) continue

    const key = `${item.relationTo}:${item.id}`
    if (keys.has(key)) return true
    keys.add(key)
  }

  return false
}

export function buildSaveItems(slots: SlotValue[]): HomepageFeaturedItemRef[] {
  return slots.flatMap((item) => {
    if (!item) return []

    return [{ relationTo: item.relationTo, id: item.id }]
  })
}

export type CandidateParams = {
  type?: HomepageFeaturedCollection | 'all'
  query?: string
  page?: number
  limit?: number
}

export type UseHomepageFeaturedSlotsOptions = {
  token: string | null
  canManage: boolean
  fetchSelection: (token: string) => Promise<HomepageFeaturedSelection>
  saveSelection: (token: string, items: HomepageFeaturedItemRef[]) => Promise<HomepageFeaturedSelection>
  fetchCandidates: (token: string, params: CandidateParams) => Promise<HomepageFeaturedCandidatesResponse>
  selectionQueryKey: unknown[]
}

export type UseHomepageFeaturedSlotsResult = {
  selectionQuery: ReturnType<typeof useQuery<HomepageFeaturedSelection>>
  candidatesQuery: ReturnType<typeof useQuery<HomepageFeaturedCandidatesResponse>>
  saveMutation: ReturnType<typeof useMutation<HomepageFeaturedSelection, unknown, HomepageFeaturedItemRef[]>>
  slots: SlotValue[]
  savedSlots: SlotValue[]
  draftSlots: SlotValue[] | null
  savedInvalidItems: HomepageFeaturedInvalidItem[]
  pickerSlotIndex: number | null
  usedKeys: Set<string>
  hasAllSlotsFilled: boolean
  hasUnsavedChanges: boolean
  saveDisabled: boolean
  invalidItemsBySlot: Map<number, HomepageFeaturedInvalidItem>
  resultMessage: string | null
  searchValue: string
  collectionFilter: HomepageFeaturedCollection | 'all'
  candidatePage: number
  handleCandidatePick: (candidate: HomepageFeaturedCandidate) => void
  handleMove: (slotIndex: number, direction: -1 | 1) => void
  handleRemove: (slotIndex: number) => void
  handleReset: () => void
  handleSave: () => void
  setSearchValue: (v: string) => void
  setCollectionFilter: (v: HomepageFeaturedCollection | 'all') => void
  setCandidatePage: (v: number | ((prev: number) => number)) => void
  setPickerSlotIndex: (v: number | null) => void
}

export function useHomepageFeaturedSlots(
  options: UseHomepageFeaturedSlotsOptions,
): UseHomepageFeaturedSlotsResult {
  const { token, canManage, fetchSelection, saveSelection, fetchCandidates, selectionQueryKey } =
    options

  const queryClient = useQueryClient()
  const [searchValue, setSearchValue] = useState('')
  const deferredSearchValue = useDeferredValue(searchValue.trim())
  const [collectionFilter, setCollectionFilter] = useState<HomepageFeaturedCollection | 'all'>('all')
  const [candidatePage, setCandidatePage] = useState(1)
  const [draftSlots, setDraftSlots] = useState<SlotValue[] | null>(null)
  const [savedSlots, setSavedSlots] = useState<SlotValue[]>([])
  const [savedInvalidItems, setSavedInvalidItems] = useState<HomepageFeaturedInvalidItem[]>([])
  const [pickerSlotIndex, setPickerSlotIndex] = useState<number | null>(null)
  const [resultMessage, setResultMessage] = useState<string | null>(null)

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
  }, [collectionFilter, deferredSearchValue])

  const candidatesQuery = useQuery({
    queryKey: [...selectionQueryKey, 'candidates', collectionFilter, deferredSearchValue, candidatePage],
    queryFn: () =>
      fetchCandidates(token!, {
        type: collectionFilter,
        query: deferredSearchValue || undefined,
        page: candidatePage,
        limit: CANDIDATE_PAGE_SIZE,
      }),
    enabled: Boolean(token && canManage),
    placeholderData: (previousData) => previousData,
  })

  const saveMutation = useMutation({
    mutationFn: (items: HomepageFeaturedItemRef[]) => saveSelection(token!, items),
    onSuccess: (selection) => {
      const nextSlots = mapSelectionToSlots(selection)
      setSavedSlots(nextSlots)
      setDraftSlots(nextSlots)
      setSavedInvalidItems(selection.invalidItems)
      setPickerSlotIndex(null)
      setResultMessage('Homepage featured content saved.')
      queryClient.setQueryData(selectionQueryKey, selection)
    },
    onError: (error: unknown) => {
      setResultMessage(
        error instanceof Error ? error.message : 'Failed to save homepage featured content.',
      )
    },
  })

  const slots = draftSlots ?? savedSlots
  const usedKeys = new Set(
    slots.flatMap((item) => (item ? [`${item.relationTo}:${item.id}`] : [])),
  )
  const hasAllSlotsFilled = slots.every((item) => item !== null)
  const hasUnsavedChanges = areSlotListsEqual(draftSlots, savedSlots) === false
  const saveDisabled =
    !token ||
    !hasAllSlotsFilled ||
    hasDuplicateSlots(slots) ||
    saveMutation.isPending ||
    !hasUnsavedChanges

  const invalidItemsBySlot = new Map<number, HomepageFeaturedInvalidItem>()
  for (const item of savedInvalidItems) {
    invalidItemsBySlot.set(item.slot, item)
  }

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

  function handleReset() {
    setDraftSlots([...savedSlots])
    setPickerSlotIndex(null)
    setResultMessage('Local changes discarded. Restored saved homepage selection.')
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
    usedKeys,
    hasAllSlotsFilled,
    hasUnsavedChanges,
    saveDisabled,
    invalidItemsBySlot,
    resultMessage,
    searchValue,
    collectionFilter,
    candidatePage,
    handleCandidatePick,
    handleMove,
    handleRemove,
    handleReset,
    handleSave,
    setSearchValue,
    setCollectionFilter,
    setCandidatePage,
    setPickerSlotIndex,
  }
}

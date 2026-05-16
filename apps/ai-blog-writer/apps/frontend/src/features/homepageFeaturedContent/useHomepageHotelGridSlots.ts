import {
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'

import type {
  HomepageHotelGridCandidate,
  HomepageHotelGridCandidatesResponse,
  HomepageHotelGridInvalidItem,
  HomepageHotelGridItemRef,
  HomepageHotelGridSelection
} from './hotelGridTypes'

const CANDIDATE_PAGE_SIZE = 24

export type HotelGridSlotValue = HomepageHotelGridCandidate | null

function createEmptySlots(count: number): HotelGridSlotValue[] {
  return Array.from({ length: count }, () => null)
}

function mapSelectionToSlots(
  selection: HomepageHotelGridSelection
): HotelGridSlotValue[] {
  const slots = createEmptySlots(selection.totalSlots)
  for (const item of selection.items) {
    if (!item.slot) continue
    const slotIndex = item.slot - 1
    if (slotIndex < 0 || slotIndex >= slots.length) continue
    slots[slotIndex] = item
  }
  return slots
}

function areSlotListsEqual(
  left: HotelGridSlotValue[] | null,
  right: HotelGridSlotValue[]
): boolean {
  if (!left) return false
  return (
    left.length === right.length &&
    left.every((item, index) => item?.id === right[index]?.id)
  )
}

export type HotelGridCandidateParams = {
  query?: string
  page?: number
  limit?: number
}

export function useHomepageHotelGridSlots(options: {
  token: string | null
  canManage: boolean
  selection: HomepageHotelGridSelection
  saveSelection: (
    token: string,
    items: HomepageHotelGridItemRef[]
  ) => Promise<HomepageHotelGridSelection>
  fetchCandidates: (
    token: string,
    params: HotelGridCandidateParams
  ) => Promise<HomepageHotelGridCandidatesResponse>
  selectionQueryKey: unknown[]
}) {
  const {
    token,
    canManage,
    selection,
    saveSelection,
    fetchCandidates,
    selectionQueryKey
  } = options
  const [searchValue, setSearchValue] = useState('')
  const deferredSearchValue = useDeferredValue(searchValue.trim())
  const [candidatePage, setCandidatePage] = useState(1)
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
  const prevSelectionKeyJsonRef = useRef<string | null>(null)
  const prevSelectionRef = useRef<HomepageHotelGridSelection | null>(null)

  useLayoutEffect(() => {
    if (
      prevSelectionKeyJsonRef.current === selectionKeyJson &&
      prevSelectionRef.current === selection
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
    isFetching: false
  } as ReturnType<typeof useQuery<HomepageHotelGridSelection>>

  useEffect(() => {
    setCandidatePage(1)
  }, [deferredSearchValue])

  const candidatesQuery = useQuery({
    queryKey: [
      ...selectionQueryKey,
      'hotel-candidates',
      deferredSearchValue,
      candidatePage
    ],
    queryFn: () =>
      fetchCandidates(token!, {
        query: deferredSearchValue || undefined,
        page: candidatePage,
        limit: CANDIDATE_PAGE_SIZE
      }),
    enabled: Boolean(token && canManage && pickerSlotIndex !== null),
    placeholderData: (previousData) => previousData
  })

  const saveMutation = useMutation({
    mutationFn: (items: HomepageHotelGridItemRef[]) =>
      saveSelection(token!, items),
    onSuccess: (selection) => {
      const nextSlots = mapSelectionToSlots(selection)
      setSavedSlots(nextSlots)
      setDraftSlots(nextSlots)
      setSavedInvalidItems(selection.invalidItems)
      setPickerSlotIndex(null)
      setResultMessage('Homepage hotel grid saved.')
    },
    onError: (error: unknown) => {
      setResultMessage(
        error instanceof Error
          ? error.message
          : 'Failed to save homepage hotel grid.'
      )
    }
  })

  const slots = draftSlots ?? savedSlots
  const usedIds = new Set(slots.flatMap((item) => (item ? [item.id] : [])))
  const hasAllSlotsFilled = slots.every((item) => item !== null)
  const hasUnsavedChanges = areSlotListsEqual(draftSlots, savedSlots) === false
  const saveDisabled =
    !token || !hasAllSlotsFilled || saveMutation.isPending || !hasUnsavedChanges
  const invalidItemsBySlot = new Map<number, HomepageHotelGridInvalidItem>()
  for (const item of savedInvalidItems) invalidItemsBySlot.set(item.slot, item)

  function updateSlots(
    transform: (current: HotelGridSlotValue[]) => HotelGridSlotValue[]
  ) {
    setDraftSlots((current) => {
      const base = current ?? savedSlots
      return transform([...base])
    })
    setResultMessage(null)
  }

  function handleCandidatePick(candidate: HomepageHotelGridCandidate) {
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

  function handleReorderAll(newSlots: HotelGridSlotValue[]) {
    updateSlots((current) => {
      if (newSlots.length !== current.length) return current
      return [...newSlots]
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
    setResultMessage('Local changes discarded. Restored saved hotel selection.')
  }

  function handleSave() {
    if (saveDisabled) return
    const items = slots.flatMap((item) => (item ? [{ id: item.id }] : []))
    saveMutation.mutate(items)
  }

  return {
    selectionQuery,
    candidatesQuery,
    saveMutation,
    slots,
    savedSlots,
    savedInvalidItems,
    pickerSlotIndex,
    usedIds,
    hasUnsavedChanges,
    saveDisabled,
    invalidItemsBySlot,
    resultMessage,
    searchValue,
    candidatePage,
    handleCandidatePick,
    handleMove,
    handleReorderAll,
    handleRemove,
    handleReset,
    handleSave,
    setSearchValue,
    setCandidatePage,
    setPickerSlotIndex,
    draftSlots
  }
}

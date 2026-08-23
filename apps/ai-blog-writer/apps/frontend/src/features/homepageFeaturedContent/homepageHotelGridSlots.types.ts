import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'

import type {
  HomepageHotelGridCandidate,
  HomepageHotelGridCandidatesResponse,
  HomepageHotelGridInvalidItem,
  HomepageHotelGridItemRef,
  HomepageHotelGridSelection
} from './hotelGridTypes'

export type HotelGridSlotValue = HomepageHotelGridCandidate | null

export type HotelGridCandidateParams = {
  query?: string
  page?: number
  limit?: number
}

export type UseHomepageHotelGridSlotsOptions = {
  canManage: boolean
  selection: HomepageHotelGridSelection
  saveSelection: (
    items: HomepageHotelGridItemRef[],
    slotCount?: number
  ) => Promise<HomepageHotelGridSelection>
  fetchCandidates: (
    params: HotelGridCandidateParams
  ) => Promise<HomepageHotelGridCandidatesResponse>
  selectionQueryKey: unknown[]
}

export type UseHomepageHotelGridSlotsResult = {
  selectionQuery: UseQueryResult<HomepageHotelGridSelection>
  candidatesQuery: UseQueryResult<HomepageHotelGridCandidatesResponse>
  saveMutation: UseMutationResult<
    HomepageHotelGridSelection,
    unknown,
    HomepageHotelGridItemRef[]
  >
  slots: HotelGridSlotValue[]
  savedSlots: HotelGridSlotValue[]
  draftSlots: HotelGridSlotValue[] | null
  savedInvalidItems: HomepageHotelGridInvalidItem[]
  pickerSlotIndex: number | null
  usedIds: Set<number>
  hasUnsavedChanges: boolean
  saveDisabled: boolean
  invalidItemsBySlot: Map<number, HomepageHotelGridInvalidItem>
  resultMessage: string | null
  searchValue: string
  candidatePage: number
  handleCandidatePick: (candidate: HomepageHotelGridCandidate) => void
  handleMove: (slotIndex: number, direction: -1 | 1) => void
  handleReorderAll: (newSlots: HotelGridSlotValue[]) => void
  handleResizeSlotCount: (slotCount: number) => void
  handleRemove: (slotIndex: number, minimumSlotCount?: number) => void
  handleReset: () => void
  handleSave: () => void
  setSearchValue: (value: string) => void
  setCandidatePage: (value: number | ((previous: number) => number)) => void
  setPickerSlotIndex: (value: number | null) => void
}

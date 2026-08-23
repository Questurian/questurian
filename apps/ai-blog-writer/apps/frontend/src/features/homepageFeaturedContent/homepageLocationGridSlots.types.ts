import type { useMutation, useQuery } from '@tanstack/react-query'

import type {
  HomepageLocationGridCandidate,
  HomepageLocationGridCandidatesResponse,
  HomepageLocationGridInvalidItem,
  HomepageLocationGridItemRef,
  HomepageLocationGridSelection
} from './locationGridTypes'
import type { LocationGridSlotValue } from './homepageLocationGridSlots.utils'

export type LocationGridCandidateParams = {
  query?: string
  page?: number
  limit?: number
}

export type UseHomepageLocationGridSlotsOptions = {
  canManage: boolean
  selection: HomepageLocationGridSelection
  saveSelection: (
    items: HomepageLocationGridItemRef[],
    slotCount?: number
  ) => Promise<HomepageLocationGridSelection>
  fetchCandidates: (
    params: LocationGridCandidateParams
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
  hasCompleteKickers: boolean
  hasCompleteDescriptions: boolean
  hasUnsavedChanges: boolean
  saveDisabled: boolean
  invalidItemsBySlot: Map<number, HomepageLocationGridInvalidItem>
  resultMessage: string | null
  searchValue: string
  candidatePage: number
  handleCandidatePick: (candidate: HomepageLocationGridCandidate) => void
  handleKickerChange: (slotIndex: number, kicker: string) => void
  handleDescriptionChange: (slotIndex: number, description: string) => void
  handleMove: (slotIndex: number, direction: -1 | 1) => void
  handleReorderAll: (newSlots: LocationGridSlotValue[]) => void
  handleResizeSlotCount: (slotCount: number) => void
  handleRemove: (slotIndex: number) => void
  handleReset: () => void
  handleSave: () => void
  setSearchValue: (v: string) => void
  setCandidatePage: (v: number | ((prev: number) => number)) => void
  setPickerSlotIndex: (v: number | null) => void
}

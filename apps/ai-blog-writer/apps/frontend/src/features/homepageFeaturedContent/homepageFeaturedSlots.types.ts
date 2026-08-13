import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'

import type {
  HomepageFeaturedCandidate,
  HomepageFeaturedCandidatesResponse,
  HomepageFeaturedCollection,
  HomepageFeaturedInvalidItem,
  HomepageFeaturedItemRef,
  HomepageFeaturedSelection,
} from './types'

export type SlotValue = HomepageFeaturedCandidate | null

export type CandidateParams = {
  type?: HomepageFeaturedCollection | 'all'
  query?: string
  page?: number
  limit?: number
}

export type UseHomepageFeaturedSlotsOptions = {
  canManage: boolean
  selection: HomepageFeaturedSelection
  saveSelection: (
    items: HomepageFeaturedItemRef[],
    slotCount?: number,
  ) => Promise<HomepageFeaturedSelection>
  fetchCandidates: (params: CandidateParams) => Promise<HomepageFeaturedCandidatesResponse>
  selectionQueryKey: unknown[]
  /** When set, candidate search stays on this collection (e.g. Questurian Maps → single-type listicles). */
  lockedCollectionFilter?: HomepageFeaturedCollection
  /** When stale saved items were removed, persist remaining items under this lower slot count. */
  repairSlotCount?: number
}

export type SaveNotification = {
  message: string
  type: 'success' | 'error'
  seq: number
}

export type UseHomepageFeaturedSlotsResult = {
  selectionQuery: UseQueryResult<HomepageFeaturedSelection>
  candidatesQuery: UseQueryResult<HomepageFeaturedCandidatesResponse>
  saveMutation: UseMutationResult<HomepageFeaturedSelection, unknown, HomepageFeaturedItemRef[]>
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
  saveNotification: SaveNotification | null
  repairSlotCount?: number
  searchValue: string
  collectionFilter: HomepageFeaturedCollection | 'all'
  /** Resolved filter sent to the candidates API (respects `lockedCollectionFilter`). */
  effectiveCollectionFilter: HomepageFeaturedCollection | 'all'
  lockedCollectionFilter?: HomepageFeaturedCollection
  candidatePage: number
  handleCandidatePick: (candidate: HomepageFeaturedCandidate) => void
  handleMove: (slotIndex: number, direction: -1 | 1) => void
  handleRemove: (slotIndex: number) => void
  handleReorderAll: (newSlots: SlotValue[]) => void
  handleResizeSlotCount: (slotCount: number) => void
  handleReset: () => void
  handleSave: () => void
  setSearchValue: (v: string) => void
  setCollectionFilter: (v: HomepageFeaturedCollection | 'all') => void
  setCandidatePage: (v: number | ((prev: number) => number)) => void
  setPickerSlotIndex: (v: number | null) => void
}

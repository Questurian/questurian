import { useDeferredValue, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import type { HomepageFeaturedCollection } from './types'
import type { UseHomepageFeaturedSlotsOptions } from './homepageFeaturedSlots.types'

const CANDIDATE_PAGE_SIZE = 24

type UseHomepageFeaturedCandidatesOptions = Pick<
  UseHomepageFeaturedSlotsOptions,
  | 'canManage'
  | 'fetchCandidates'
  | 'selectionQueryKey'
  | 'lockedCollectionFilter'
> & {
  pickerSlotIndex: number | null
}

export function useHomepageFeaturedCandidates({
  canManage,
  fetchCandidates,
  selectionQueryKey,
  lockedCollectionFilter,
  pickerSlotIndex
}: UseHomepageFeaturedCandidatesOptions) {
  const [searchValue, setSearchValue] = useState('')
  const deferredSearchValue = useDeferredValue(searchValue.trim())
  const [collectionFilter, setCollectionFilter] = useState<
    HomepageFeaturedCollection | 'all'
  >(lockedCollectionFilter ?? 'all')
  const [candidatePage, setCandidatePage] = useState(1)

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
      candidatePage
    ],
    queryFn: () =>
      fetchCandidates({
        type: effectiveCollectionFilter,
        query: deferredSearchValue || undefined,
        page: candidatePage,
        limit: CANDIDATE_PAGE_SIZE
      }),
    enabled: Boolean(canManage && pickerSlotIndex !== null),
    placeholderData: (previousData) => previousData
  })

  return {
    searchValue,
    collectionFilter,
    effectiveCollectionFilter,
    candidatePage,
    candidatesQuery,
    setSearchValue,
    setCollectionFilter,
    setCandidatePage
  }
}

import { useDeferredValue, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import type { UseHomepageLocationGridSlotsOptions } from './homepageLocationGridSlots.types'

const CANDIDATE_PAGE_SIZE = 24

type UseHomepageLocationGridCandidatesOptions = Pick<
  UseHomepageLocationGridSlotsOptions,
  'token' | 'canManage' | 'fetchCandidates' | 'selectionQueryKey'
> & {
  pickerSlotIndex: number | null
}

export function useHomepageLocationGridCandidates({
  token,
  canManage,
  fetchCandidates,
  selectionQueryKey,
  pickerSlotIndex
}: UseHomepageLocationGridCandidatesOptions) {
  const [searchValue, setSearchValue] = useState('')
  const deferredSearchValue = useDeferredValue(searchValue.trim())
  const [candidatePage, setCandidatePage] = useState(1)

  useEffect(() => {
    setCandidatePage(1)
  }, [deferredSearchValue])

  const candidatesQuery = useQuery({
    queryKey: [
      ...selectionQueryKey,
      'location-candidates',
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

  return {
    searchValue,
    candidatePage,
    candidatesQuery,
    setSearchValue,
    setCandidatePage
  }
}

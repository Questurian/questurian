import { useDeferredValue, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import type { UseHomepageHotelGridSlotsOptions } from './homepageHotelGridSlots.types'

const CANDIDATE_PAGE_SIZE = 24

type UseHomepageHotelGridCandidatesOptions = Pick<
  UseHomepageHotelGridSlotsOptions,
  'token' | 'canManage' | 'fetchCandidates' | 'selectionQueryKey'
> & {
  pickerSlotIndex: number | null
}

export function useHomepageHotelGridCandidates({
  token,
  canManage,
  fetchCandidates,
  selectionQueryKey,
  pickerSlotIndex
}: UseHomepageHotelGridCandidatesOptions) {
  const [searchValue, setSearchValue] = useState('')
  const deferredSearchValue = useDeferredValue(searchValue.trim())
  const [candidatePage, setCandidatePage] = useState(1)

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

  return {
    searchValue,
    candidatePage,
    candidatesQuery,
    setSearchValue,
    setCandidatePage
  }
}

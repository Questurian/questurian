import { useMutation } from '@tanstack/react-query'
import type { MutableRefObject } from 'react'

import type {
  HomepageHotelGridItemRef,
  HomepageHotelGridSelection
} from './hotelGridTypes'
import type { UseHomepageHotelGridSlotsOptions } from './homepageHotelGridSlots.types'

type UseHomepageHotelGridSaveMutationOptions = Pick<
  UseHomepageHotelGridSlotsOptions,
  'saveSelection'
> & {
  slotCountRef: MutableRefObject<number>
  onSuccess: (selection: HomepageHotelGridSelection) => void
  onError: (error: unknown) => void
}

export function useHomepageHotelGridSaveMutation({
  saveSelection,
  slotCountRef,
  onSuccess,
  onError
}: UseHomepageHotelGridSaveMutationOptions) {
  return useMutation({
    mutationFn: (items: HomepageHotelGridItemRef[]) =>
      saveSelection(items, slotCountRef.current),
    onSuccess,
    onError
  })
}

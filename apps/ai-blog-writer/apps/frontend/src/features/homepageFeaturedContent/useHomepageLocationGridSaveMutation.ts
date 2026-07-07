import { useMutation } from '@tanstack/react-query'
import type { MutableRefObject } from 'react'

import type {
  HomepageLocationGridItemRef,
  HomepageLocationGridSelection
} from './locationGridTypes'
import type { UseHomepageLocationGridSlotsOptions } from './homepageLocationGridSlots.types'

type UseHomepageLocationGridSaveMutationOptions = Pick<
  UseHomepageLocationGridSlotsOptions,
  'token' | 'saveSelection'
> & {
  slotCountRef: MutableRefObject<number>
  onSuccess: (selection: HomepageLocationGridSelection) => void
  onError: (error: unknown) => void
}

export function useHomepageLocationGridSaveMutation({
  token,
  saveSelection,
  slotCountRef,
  onSuccess,
  onError
}: UseHomepageLocationGridSaveMutationOptions) {
  return useMutation({
    mutationFn: (items: HomepageLocationGridItemRef[]) =>
      saveSelection(token!, items, slotCountRef.current),
    onSuccess,
    onError
  })
}

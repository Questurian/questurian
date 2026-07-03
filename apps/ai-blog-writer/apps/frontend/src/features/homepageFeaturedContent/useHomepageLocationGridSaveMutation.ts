import { useMutation } from '@tanstack/react-query'

import type {
  HomepageLocationGridItemRef,
  HomepageLocationGridSelection
} from './locationGridTypes'
import type { UseHomepageLocationGridSlotsOptions } from './homepageLocationGridSlots.types'

type UseHomepageLocationGridSaveMutationOptions = Pick<
  UseHomepageLocationGridSlotsOptions,
  'token' | 'saveSelection'
> & {
  onSuccess: (selection: HomepageLocationGridSelection) => void
  onError: (error: unknown) => void
}

export function useHomepageLocationGridSaveMutation({
  token,
  saveSelection,
  onSuccess,
  onError
}: UseHomepageLocationGridSaveMutationOptions) {
  return useMutation({
    mutationFn: (items: HomepageLocationGridItemRef[]) =>
      saveSelection(token!, items),
    onSuccess,
    onError
  })
}

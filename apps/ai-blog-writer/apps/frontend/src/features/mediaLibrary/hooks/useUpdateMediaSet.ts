import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateMediaSet } from '../../../shared/api/payload/payload.api'
import type { MediaSetPatch } from '../../../shared/api/payload/payload.types'

export function useUpdateMediaSet() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: MediaSetPatch }) =>
      updateMediaSet(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media-library'] })
    },
  })
}

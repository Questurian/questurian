import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateMediaSet } from '../../../shared/api/payload/payload.api'
import type { MediaSetPatch } from '../../../shared/api/payload/payload.types'

export function useUpdateMediaSet(token: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: MediaSetPatch }) =>
      updateMediaSet(id, patch, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media-library'] })
    },
  })
}

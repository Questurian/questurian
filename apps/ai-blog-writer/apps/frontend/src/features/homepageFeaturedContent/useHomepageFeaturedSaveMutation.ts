import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { MutableRefObject } from 'react'

import type {
  HomepageFeaturedItemRef,
  HomepageFeaturedSelection
} from './types'
import type {
  SaveNotification,
  UseHomepageFeaturedSlotsOptions
} from './homepageFeaturedSlots.types'

type UseHomepageFeaturedSaveMutationOptions = Pick<
  UseHomepageFeaturedSlotsOptions,
  'saveSelection'
> & {
  slotCountRef: MutableRefObject<number>
  onSuccess: (selection: HomepageFeaturedSelection) => void
  onResultMessage: (message: string) => void
}

export function useHomepageFeaturedSaveMutation({
  saveSelection,
  slotCountRef,
  onSuccess,
  onResultMessage
}: UseHomepageFeaturedSaveMutationOptions) {
  const [saveNotification, setSaveNotification] =
    useState<SaveNotification | null>(null)

  const saveMutation = useMutation({
    mutationFn: (items: HomepageFeaturedItemRef[]) =>
      saveSelection(items, slotCountRef.current),
    onSuccess: (selection) => {
      onSuccess(selection)
      onResultMessage('Homepage featured content saved.')
      setSaveNotification({
        message: 'Saved',
        type: 'success',
        seq: Date.now()
      })
    },
    onError: (error: unknown) => {
      onResultMessage(
        error instanceof Error
          ? error.message
          : 'Failed to save homepage featured content.'
      )
      setSaveNotification({
        message: 'Save failed',
        type: 'error',
        seq: Date.now()
      })
    }
  })

  return { saveMutation, saveNotification }
}

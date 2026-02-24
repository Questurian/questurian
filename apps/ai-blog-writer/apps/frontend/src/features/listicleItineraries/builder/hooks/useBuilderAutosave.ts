import { useEffect } from 'react'
import { saveDraft } from '../../storage'
import type { ListicleItineraryDraft } from '../../types'

type UseBuilderAutosaveParams = {
  draft: ListicleItineraryDraft | null
}

export function useBuilderAutosave({ draft }: UseBuilderAutosaveParams): void {
  useEffect(() => {
    if (!draft) return

    const timer = window.setTimeout(() => {
      saveDraft(draft)
    }, 400)

    return () => window.clearTimeout(timer)
  }, [draft])
}

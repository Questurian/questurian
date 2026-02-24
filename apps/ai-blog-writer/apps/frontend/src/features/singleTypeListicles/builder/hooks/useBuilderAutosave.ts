import { useEffect } from 'react'
import { saveDraft } from '../../storage'
import type { SingleTypeListicleDraft } from '../../types'

export function useBuilderAutosave(draft: SingleTypeListicleDraft | null) {
  useEffect(() => {
    if (!draft) return

    const timer = window.setTimeout(() => {
      saveDraft(draft)
    }, 400)

    return () => window.clearTimeout(timer)
  }, [draft])
}

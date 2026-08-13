import type { Dispatch, SetStateAction } from 'react'
import { useState } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'
import { saveDraft } from '../../storage'
import type { RelatedItemOption, SingleTypeListicleDraft } from '../../types'
import { submitListicle } from '../services/listicle-submit.service'

type UseListicleSubmitParams = {
  draft: SingleTypeListicleDraft | null
  relatedItems: RelatedItemOption[]
  selectedLocationRefId: number | null
  setDraft: Dispatch<SetStateAction<SingleTypeListicleDraft | null>>
  setSearchParams: SetURLSearchParams
  onError: (message: string) => void
  onResult: (message: string | null) => void
}

type UseListicleSubmitResult = {
  isSaving: boolean
  submit: (targetStatus: 'draft' | 'published') => Promise<void>
}

export function useListicleSubmit({
  draft,
  relatedItems,
  selectedLocationRefId,
  setDraft,
  setSearchParams,
  onError,
  onResult,
}: UseListicleSubmitParams): UseListicleSubmitResult {
  const [isSaving, setIsSaving] = useState(false)

  async function submit(targetStatus: 'draft' | 'published') {
    if (!draft) return

    onError('')
    onResult(null)

    try {
      setIsSaving(true)
      const { doc, nextDraft, resultMessage } = await submitListicle({
        draft,
        selectedLocationRefId,
        targetStatus,
        relatedItems,
      })

      setDraft(nextDraft)
      saveDraft(nextDraft)
      onResult(resultMessage)

      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('id', String(doc.id))
          next.set('draftId', nextDraft.draftId)
          return next
        },
        { replace: true },
      )
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setIsSaving(false)
    }
  }

  return { isSaving, submit }
}

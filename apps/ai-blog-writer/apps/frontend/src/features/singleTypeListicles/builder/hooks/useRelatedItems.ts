import { useEffect, useState } from 'react'
import { fetchRelatedItems } from '../../api'
import type { RelatedItemOption, SingleTypeListicleDraft } from '../../types'

type UseRelatedItemsParams = {
  token?: string
  draft: SingleTypeListicleDraft | null
  onError: (message: string) => void
}

type UseRelatedItemsResult = {
  relatedItems: RelatedItemOption[]
  isLoadingRelated: boolean
}

export function useRelatedItems({ token, draft, onError }: UseRelatedItemsParams): UseRelatedItemsResult {
  const [relatedItems, setRelatedItems] = useState<RelatedItemOption[]>([])
  const [isLoadingRelated, setIsLoadingRelated] = useState(false)

  useEffect(() => {
    if (!token || !draft?.listicleType || !draft.location) {
      setRelatedItems([])
      return
    }

    let cancelled = false
    setIsLoadingRelated(true)

    fetchRelatedItems(draft.listicleType, draft.location, token)
      .then((docs) => {
        if (cancelled) return
        setRelatedItems(docs)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        onError(err instanceof Error ? err.message : 'Failed to load related items')
      })
      .finally(() => {
        if (cancelled) return
        setIsLoadingRelated(false)
      })

    return () => {
      cancelled = true
    }
  }, [token, draft?.listicleType, draft?.location, onError])

  return { relatedItems, isLoadingRelated }
}

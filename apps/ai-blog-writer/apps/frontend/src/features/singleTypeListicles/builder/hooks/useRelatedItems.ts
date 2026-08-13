import { useEffect, useState } from 'react'
import { fetchRelatedItems } from '../../api'
import { getArticleLocationScope } from '../../../../shared/locationScope/scope'
import type { LocationOption, RelatedItemOption, SingleTypeListicleDraft } from '../../types'

type UseRelatedItemsParams = {
  draft: SingleTypeListicleDraft | null
  locations: LocationOption[]
  onError: (message: string) => void
}

type UseRelatedItemsResult = {
  relatedItems: RelatedItemOption[]
  isLoadingRelated: boolean
}

export function useRelatedItems({ draft, locations, onError }: UseRelatedItemsParams): UseRelatedItemsResult {
  const [relatedItems, setRelatedItems] = useState<RelatedItemOption[]>([])
  const [isLoadingRelated, setIsLoadingRelated] = useState(false)

  useEffect(() => {
    if (!draft?.listicleType || !draft.location) {
      setRelatedItems([])
      return
    }

    const authToken = undefined
    const listicleType = draft.listicleType
    const locationKey = draft.location
    const sharedNeighborhoods = draft.sharedNeighborhoods

    let cancelled = false
    setIsLoadingRelated(true)

    getArticleLocationScope({
      locationKey,
      sharedNeighborhoods,
      locations,
    })
      .then((scope) => {
        if (cancelled) return []
        return fetchRelatedItems(listicleType, locationKey, scope)
      })
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
  }, [draft?.listicleType, draft?.location, draft?.sharedNeighborhoods, locations, onError])

  return { relatedItems, isLoadingRelated }
}

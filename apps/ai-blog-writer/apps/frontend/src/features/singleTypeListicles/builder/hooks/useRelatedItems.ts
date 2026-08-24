import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { fetchInstagramPostsByIds, fetchRelatedItems } from '../../api'
import { getArticleLocationScope } from '../../../../shared/locationScope/scope'
import type {
  LocationOption,
  RelatedItemOption,
  SingleTypeListicleDraft
} from '../../types'
import { reconcileStaleInstagramSelections } from '../services/reconcile-stale-instagram-selections'

type UseRelatedItemsParams = {
  draft: SingleTypeListicleDraft | null
  locations: LocationOption[]
  setDraft: Dispatch<SetStateAction<SingleTypeListicleDraft | null>>
  onError: (message: string) => void
}

type UseRelatedItemsResult = {
  relatedItems: RelatedItemOption[]
  isLoadingRelated: boolean
}

export function useRelatedItems({
  draft,
  locations,
  setDraft,
  onError
}: UseRelatedItemsParams): UseRelatedItemsResult {
  const [relatedItems, setRelatedItems] = useState<RelatedItemOption[]>([])
  const [isLoadingRelated, setIsLoadingRelated] = useState(false)

  useEffect(() => {
    if (!draft?.listicleType || !draft.location) {
      setRelatedItems([])
      return
    }

    const listicleType = draft.listicleType
    const locationKey = draft.location
    const sharedNeighborhoods = draft.sharedNeighborhoods

    let cancelled = false
    setIsLoadingRelated(true)

    getArticleLocationScope({
      locationKey,
      sharedNeighborhoods,
      locations
    })
      .then((scope) => {
        if (cancelled) return []
        return fetchRelatedItems(listicleType, locationKey, scope)
      })
      .then(async (docs) => {
        if (cancelled) return
        setRelatedItems(docs)

        const selectedPostIds = [
          ...new Set(
            draft.items.flatMap((item) =>
              item.selectedInstagramPost ? [item.selectedInstagramPost] : []
            )
          )
        ]
        if (selectedPostIds.length === 0) return

        const selectedPosts = await fetchInstagramPostsByIds(selectedPostIds)
        if (cancelled) return
        setDraft((current) =>
          current
            ? reconcileStaleInstagramSelections(current, docs, selectedPosts)
            : current
        )
      })
      .catch((err: unknown) => {
        if (cancelled) return
        onError(
          err instanceof Error ? err.message : 'Failed to load related items'
        )
      })
      .finally(() => {
        if (cancelled) return
        setIsLoadingRelated(false)
      })

    return () => {
      cancelled = true
    }
  }, [
    draft?.listicleType,
    draft?.location,
    draft?.sharedNeighborhoods,
    locations,
    setDraft,
    onError
  ])

  return { relatedItems, isLoadingRelated }
}

import { useEffect, useState } from 'react'
import { getLocationScopeForKey } from '../../../locationScope/scope'
import { fetchRelatedItems } from '../../api'
import type { ItineraryBlockType, RelatedItemOption } from '../../types'
import { BLOCK_TYPE_OPTIONS, EMPTY_RELATED_BY_BLOCK_TYPE } from '../constants/builder-options.constants'

type UseRelatedItemsParams = {
  token?: string
  location?: string
  onError: (message: string) => void
}

type UseRelatedItemsResult = {
  isLoadingRelated: boolean
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>
}

export function useRelatedItems({ token, location, onError }: UseRelatedItemsParams): UseRelatedItemsResult {
  const [isLoadingRelated, setIsLoadingRelated] = useState(false)
  const [relatedByBlockType, setRelatedByBlockType] = useState<Record<ItineraryBlockType, RelatedItemOption[]>>(EMPTY_RELATED_BY_BLOCK_TYPE)

  useEffect(() => {
    if (!token || !location) {
      setRelatedByBlockType(EMPTY_RELATED_BY_BLOCK_TYPE)
      return
    }

    let cancelled = false
    setIsLoadingRelated(true)

    getLocationScopeForKey(location, token)
      .then((scope) => {
        if (cancelled) return []
        return Promise.all(BLOCK_TYPE_OPTIONS.map((option) => fetchRelatedItems(option.value, location, token, scope)))
      })
      .then((docsByType) => {
        if (cancelled) return
        setRelatedByBlockType({
          'itinerary-dining': docsByType[0] || [],
          'itinerary-accommodations': docsByType[1] || [],
          'itinerary-attractions': docsByType[2] || [],
          'itinerary-nightlife': docsByType[3] || [],
          'itinerary-key-location': docsByType[4] || [],
        })
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
  }, [token, location, onError])

  return {
    isLoadingRelated,
    relatedByBlockType,
  }
}

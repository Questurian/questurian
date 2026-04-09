import { useEffect, useState } from 'react'
import { getArticleLocationScope } from '../../../locationScope/scope'
import { fetchRelatedItems } from '../../api'
import type { ItineraryBlockType, LocationOption, RelatedItemOption } from '../../types'
import { BLOCK_TYPE_OPTIONS, EMPTY_RELATED_BY_BLOCK_TYPE } from '../constants/builder-options.constants'

type UseRelatedItemsParams = {
  token?: string | null
  location?: string
  sharedNeighborhoods?: number[]
  locations: LocationOption[]
  onError: (message: string) => void
}

type UseRelatedItemsResult = {
  isLoadingRelated: boolean
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>
}

export function useRelatedItems({
  token,
  location,
  sharedNeighborhoods,
  locations,
  onError,
}: UseRelatedItemsParams): UseRelatedItemsResult {
  const [isLoadingRelated, setIsLoadingRelated] = useState(false)
  const [relatedByBlockType, setRelatedByBlockType] = useState<Record<ItineraryBlockType, RelatedItemOption[]>>(EMPTY_RELATED_BY_BLOCK_TYPE)

  useEffect(() => {
    if (!token || !location) {
      setRelatedByBlockType(EMPTY_RELATED_BY_BLOCK_TYPE)
      return
    }

    const authToken = token
    const primaryLocation = location
    const exactNeighborhoods = sharedNeighborhoods

    let cancelled = false
    setIsLoadingRelated(true)

    getArticleLocationScope({
      locationKey: primaryLocation,
      sharedNeighborhoods: exactNeighborhoods,
      locations,
      token: authToken,
    })
      .then((scope) => {
        if (cancelled) return []
        return Promise.all(BLOCK_TYPE_OPTIONS.map(async (option) => (
          [option.value, await fetchRelatedItems(option.value, primaryLocation, authToken, scope)] as const
        )))
      })
      .then((docsByType) => {
        if (cancelled) return
        const next = { ...EMPTY_RELATED_BY_BLOCK_TYPE }
        docsByType.forEach(([blockType, docs]) => {
          next[blockType] = docs || []
        })
        setRelatedByBlockType(next)
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
  }, [token, location, sharedNeighborhoods, locations, onError])

  return {
    isLoadingRelated,
    relatedByBlockType,
  }
}

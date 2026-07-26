import { useEffect, useState } from 'react'

import { mapDetailResponsesToValues } from '../lib/placeDetailsState'
import { fetchPlaceDetailResponses } from '../services/placeDetailsApi'
import type { DetailTypeValues, RelationshipId } from '../types/placeDetails'

const EMPTY_DETAIL_TYPES: DetailTypeValues = {}

export const useExistingPlaceDetails = (placeId: RelationshipId | undefined) => {
  const [detailTypes, setDetailTypes] = useState<DetailTypeValues>(EMPTY_DETAIL_TYPES)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    if (!placeId) {
      setDetailTypes(EMPTY_DETAIL_TYPES)
      setIsLoading(false)
      return
    }

    setDetailTypes(EMPTY_DETAIL_TYPES)
    setIsLoading(true)
    fetchPlaceDetailResponses(placeId)
      .then((responses) => {
        if (!cancelled) setDetailTypes(mapDetailResponsesToValues(responses))
      })
      .catch((error: unknown) => {
        console.error('[PlaceDetailsField] Error fetching detail records:', error)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [placeId])

  return { detailTypes, isLoading }
}

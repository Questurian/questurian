import { useEffect, useMemo, useState } from 'react'

import { extractRelationshipIds } from '../lib/placeDetailsState'
import { fetchPlaceCategories } from '../services/placeDetailsApi'
import type { PlaceCategory } from '../types/placeDetails'

export const usePlaceCategories = (relationshipValue: unknown) => {
  const categoryIds = useMemo(() => extractRelationshipIds(relationshipValue), [relationshipValue])
  const categoryKey = JSON.stringify(categoryIds)
  const [categories, setCategories] = useState<PlaceCategory[]>([])

  useEffect(() => {
    let cancelled = false

    if (categoryIds.length === 0) {
      setCategories([])
      return
    }

    setCategories([])
    fetchPlaceCategories(categoryIds)
      .then((nextCategories) => {
        if (!cancelled) setCategories(nextCategories)
      })
      .catch((error: unknown) => {
        console.error('[PlaceDetailsField] Error fetching categories:', error)
      })

    return () => {
      cancelled = true
    }
  }, [categoryKey])

  return { categoryIds, categories }
}

import { useCallback, useEffect, useMemo } from 'react'
import { useField } from '@payloadcms/ui'

import type { DetailFieldName, DetailTypeValues } from '../types/placeDetails'

export const usePlaceDetailFields = (initialValues: DetailTypeValues) => {
  const dining = useField<string>({ path: 'diningType' })
  const accommodation = useField<string>({ path: 'accommodationType' })
  const nightlife = useField<string>({ path: 'nightlifeType' })
  const attraction = useField<string>({ path: 'attractionType' })

  const setters = useMemo(
    () => ({
      diningType: dining.setValue,
      accommodationType: accommodation.setValue,
      nightlifeType: nightlife.setValue,
      attractionType: attraction.setValue,
    }),
    [accommodation.setValue, attraction.setValue, dining.setValue, nightlife.setValue],
  )

  useEffect(() => {
    for (const [fieldName, value] of Object.entries(initialValues)) {
      if (value) setters[fieldName as DetailFieldName](value)
    }
  }, [initialValues, setters])

  const values = useMemo(
    () => ({
      diningType: dining.value,
      accommodationType: accommodation.value,
      nightlifeType: nightlife.value,
      attractionType: attraction.value,
    }),
    [accommodation.value, attraction.value, dining.value, nightlife.value],
  )

  const setValue = useCallback(
    (fieldName: DetailFieldName, value: string) => {
      setters[fieldName](value)
    },
    [setters],
  )

  return { values, setValue }
}

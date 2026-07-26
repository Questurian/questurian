'use client'

import { useDocumentInfo, useField } from '@payloadcms/ui'
import { useMemo } from 'react'
import type { FC } from 'react'

import { getActivePlaceDetailConfigs } from '../lib/placeDetailsState'
import { useExistingPlaceDetails } from '../hooks/useExistingPlaceDetails'
import { usePlaceCategories } from '../hooks/usePlaceCategories'
import { usePlaceDetailFields } from '../hooks/usePlaceDetailFields'
import { PlaceDetailsPanel } from './place-details/PlaceDetailsPanel'

type Props = {
  path: string
}

const PlaceDetailsField: FC<Props> = () => {
  const { id } = useDocumentInfo()
  const { value: categoriesValue } = useField<unknown>({ path: 'categories' })
  const { categoryIds, categories } = usePlaceCategories(categoriesValue)
  const { detailTypes, isLoading: isLoadingDetails } = useExistingPlaceDetails(id)
  const { values, setValue } = usePlaceDetailFields(detailTypes)

  const activeDetails = useMemo(() => getActivePlaceDetailConfigs(categories), [categories])

  return (
    <PlaceDetailsPanel
      activeDetails={activeDetails}
      hasSelectedCategories={categoryIds.length > 0}
      isLoadingDetails={isLoadingDetails}
      values={values}
      onChange={setValue}
    />
  )
}

export default PlaceDetailsField

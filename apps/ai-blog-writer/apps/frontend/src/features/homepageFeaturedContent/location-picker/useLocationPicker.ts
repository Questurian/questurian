import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchLocationsIndex } from '../../locationDocuments/api'
import {
  countGroupedLocations,
  groupLocationOptions,
} from './location-groups'

type UseLocationPickerOptions = {
  existingLocationIds: number[]
  onSelect: (locationId: number) => Promise<void>
  onClose: () => void
}

export function useLocationPicker({
  existingLocationIds,
  onSelect,
  onClose,
}: UseLocationPickerOptions) {
  const [searchValue, setSearchValue] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cityQuery = useQuery({
    queryKey: ['locations-city'],
    queryFn: () => fetchLocationsIndex({ level: 'city' }),
    staleTime: 60_000,
  })
  const neighborhoodQuery = useQuery({
    queryKey: ['locations-neighborhood'],
    queryFn: () => fetchLocationsIndex({ level: 'neighborhood' }),
    staleTime: 60_000,
  })

  const groupedLocations = useMemo(
    () =>
      groupLocationOptions(
        cityQuery.data ?? [],
        neighborhoodQuery.data ?? [],
        existingLocationIds,
        searchValue,
      ),
    [
      cityQuery.data,
      neighborhoodQuery.data,
      existingLocationIds,
      searchValue,
    ],
  )

  const selectLocation = async (locationId: number) => {
    setIsSubmitting(true)
    setError(null)
    try {
      await onSelect(locationId)
    } catch (selectionError) {
      setError(
        selectionError instanceof Error
          ? selectionError.message
          : 'Failed to create location homepage.',
      )
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return {
    searchValue,
    setSearchValue,
    isSubmitting,
    error,
    groupedLocations,
    isLoading: cityQuery.isLoading || neighborhoodQuery.isLoading,
    totalResults: countGroupedLocations(groupedLocations),
    selectLocation,
  }
}

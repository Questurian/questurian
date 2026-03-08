/**
 * Hook for fetching and managing location data
 */

import { useEffect, useRef, useState } from 'react'
import { buildLocationOptionsQuery } from '../constants'
import { LocationOption } from '../types'

export const useLocationData = () => {
  const [countries, setCountries] = useState<LocationOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const allLocationsRef = useRef<LocationOption[]>([])

  useEffect(() => {
    const fetchAllLocations = async () => {
      try {
        const limit = 500
        let page = 1
        let totalPages = 1
        const allDocs: LocationOption[] = []

        while (page <= totalPages) {
          const response = await fetch(buildLocationOptionsQuery(page, limit))
          if (!response.ok) {
            throw new Error(`Failed to fetch locations (page ${page})`)
          }

          const data = await response.json()
          const docs = (data.docs || []) as LocationOption[]

          allDocs.push(...docs)
          totalPages = typeof data.totalPages === 'number' ? data.totalPages : page
          page += 1
        }

        // Filter countries: where city is null/empty
        const countryList = allDocs.filter((doc) => !doc.city)

        setCountries(countryList)
        allLocationsRef.current = allDocs
      } catch (error) {
        console.error('useLocationData: Error fetching locations:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchAllLocations()
  }, [])

  return {
    countries,
    isLoading,
    allLocations: allLocationsRef.current,
    allLocationsRef,
  }
}

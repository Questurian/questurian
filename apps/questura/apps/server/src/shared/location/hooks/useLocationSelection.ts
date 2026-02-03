/**
 * Hook for managing location selection and cascading filtering
 *
 * Manages the three-level location hierarchy: country → city → neighborhood
 *
 * Key Features:
 * 1. Parses saved location values on initial load
 * 2. Cascades dropdown options when selections change
 * 3. Distinguishes between initial population and user interaction
 *    (only clears dependent selections when user actually changes parent)
 *
 * Data Flow:
 * ```
 * allLocations (flat list)
 *   ↓
 *   Parse saved value → Populate all three dropdowns
 *   ↓
 *   User selects country → Filter cities → Show city options
 *   ↓
 *   User selects city → Filter neighborhoods → Show neighborhood options
 * ```
 *
 * The prevCountryRef and prevCityRef pattern is essential:
 * - On initial load, we populate all selections from the saved value
 * - When user changes parent, we clear children (but not on first render)
 * - This prevents clearing selections during form initialization
 */

import { useEffect, useRef, useState } from 'react'
import { LocationOption } from '../types'
import { parseLocationValue, filterCitiesByCountry, filterNeighborhoodsByCity } from '../utils'

export const useLocationSelection = (
  value: string,
  isLoading: boolean,
  allLocations: LocationOption[]
) => {
  // ==================== State ====================
  const [cities, setCities] = useState<LocationOption[]>([])
  const [neighborhoods, setNeighborhoods] = useState<LocationOption[]>([])
  const [selectedCountry, setSelectedCountry] = useState<string>('')
  const [selectedCity, setSelectedCity] = useState<string>('')
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string>('')

  // ==================== Refs: Detect User Interaction ====================
  /**
   * prevCountryRef: Distinguish initial population from user changing country
   * - First render: prevCountryRef.current = '' (empty)
   * - Initial population: selectedCountry gets set to '123' (location ID)
   * - prevCountryRef check: '' !== '123', but we skip clearing (prevCountryRef was empty)
   * - User changes country: '123' → '456'
   * - prevCountryRef check: '123' !== '456', NOW we clear city/neighborhood
   *
   * This pattern prevents clearing dependent dropdowns during form load
   */
  const prevCountryRef = useRef<string>('')
  const prevCityRef = useRef<string>('')

  // ==================== Effect 1: Load Saved Location ====================
  /**
   * Parse location value and populate dropdown selections
   * Handles nested country > city > neighborhood hierarchy
   * Only runs once when data is loaded and value is available
   */
  const populateSelectionsFromValue = (
    locationValue: string,
    locations: LocationOption[]
  ) => {
    const parsed = parseLocationValue(locationValue)
    if (!parsed) return

    const { country, city, neighborhood } = parsed

    // Find and select the country
    const countryLocation = locations.find(
      (loc) => loc.country === country && !loc.city && !loc.neighborhood
    )

    if (countryLocation) {
      setSelectedCountry(String(countryLocation.id))

      // Find and select the city if it exists
      if (city) {
        const cityLocation = locations.find(
          (loc) =>
            loc.country === country && loc.city === city && !loc.neighborhood
        )
        if (cityLocation) {
          setSelectedCity(String(cityLocation.id))

          // Find and select the neighborhood if it exists
          if (neighborhood) {
            const neighborhoodLocation = locations.find(
              (loc) =>
                loc.country === country &&
                loc.city === city &&
                loc.neighborhood === neighborhood
            )
            if (neighborhoodLocation) {
              setSelectedNeighborhood(String(neighborhoodLocation.id))
            }
          }
        }
      }
    }
  }

  useEffect(() => {
    if (!isLoading && value && allLocations.length > 0) {
      populateSelectionsFromValue(value, allLocations)
    }
  }, [isLoading, value, allLocations])

  // ==================== Effect 2: Filter Cities When Country Changes ====================
  /**
   * When country is selected, filter and display available cities
   *
   * The prevCountryRef check ensures we only clear city/neighborhood selections
   * when the user actually changes the country (not during initial load):
   *
   * Timeline:
   * 1. Initial render: selectedCountry = '', prevCountryRef.current = ''
   * 2. Load saved value: selectedCountry = '5' (country ID)
   *    - prevCountryRef check: '' !== '5' BUT prevCountryRef === '', so DON'T clear
   * 3. User picks different country: selectedCountry = '10'
   *    - prevCountryRef check: '5' !== '10' AND prevCountryRef !== '', so CLEAR city
   * 4. Update ref: prevCountryRef.current = '10' for next cycle
   */
  useEffect(() => {
    if (selectedCountry && allLocations.length > 0) {
      const citiesList = filterCitiesByCountry(allLocations, selectedCountry)
      setCities(citiesList)

      // Only clear city/neighborhood if country actually changed (not on initial load)
      const countryChanged =
        prevCountryRef.current !== '' && prevCountryRef.current !== selectedCountry
      if (countryChanged) {
        setSelectedCity('')
        setSelectedNeighborhood('')
        setNeighborhoods([])
      }
    } else {
      setCities([])
      setNeighborhoods([])
    }

    // Update the ref after processing for next cycle
    prevCountryRef.current = selectedCountry
  }, [selectedCountry, allLocations])

  // ==================== Effect 3: Filter Neighborhoods When City Changes ====================
  /**
   * When city is selected, filter and display available neighborhoods
   *
   * Same pattern as country effect: only clears neighborhoods if city
   * actually changed, not during initial load
   */
  useEffect(() => {
    if (selectedCountry && selectedCity && allLocations.length > 0) {
      const neighborhoodsList = filterNeighborhoodsByCity(
        allLocations,
        selectedCountry,
        selectedCity
      )
      setNeighborhoods(neighborhoodsList)

      // Only clear neighborhood if city actually changed (not on initial load)
      const cityChanged = prevCityRef.current !== '' && prevCityRef.current !== selectedCity
      if (cityChanged) {
        setSelectedNeighborhood('')
      }
    } else {
      setNeighborhoods([])
    }

    // Update the ref after processing for next cycle
    prevCityRef.current = selectedCity
  }, [selectedCountry, selectedCity, allLocations])

  return {
    cities,
    neighborhoods,
    selectedCountry,
    selectedCity,
    selectedNeighborhood,
    setSelectedCountry,
    setSelectedCity,
    setSelectedNeighborhood,
  }
}

'use client'

/**
 * Location Picker Field Component
 *
 * A custom Payload CMS field component for selecting hierarchical locations (country → city → neighborhood).
 * Orchestrates multiple hooks to manage location selection, form synchronization, and UI state.
 *
 * Data Flow:
 * 1. Component mounts → useLocationData fetches all locations from API
 * 2. On edit load → useLocationSelection parses saved value into selections
 * 3. User interacts → Dropdowns update through useLocationSelection
 * 4. User clicks Done → usePickerExpanded detects completion
 * 5. useLocationFormSync pushes to Payload form field
 * 6. Component re-renders with updated value
 */

import { useEffect, type MouseEvent } from 'react'
import { useField, useFormFields } from '@payloadcms/ui'
import { LocationDisplayBox, AddLocationButton, LocationDropdowns } from './components'
import { useLocationData, useLocationSelection, usePickerExpanded } from './hooks'
import type { LocationPickerFieldProps } from './types'
import { formatLocationForDisplay } from './utils'
import styles from './styles/location.module.css'

const getSiblingFieldPath = (path: string, sibling: string) => {
  if (!path) return sibling
  const parts = path.split('.')
  parts[parts.length - 1] = sibling
  return parts.join('.')
}

export const LocationPickerField = (props: LocationPickerFieldProps) => {
  const { path } = props

  // ==================== Form Fields ====================
  // Get form field setters for location value
  const { value, setValue } = useField<string>({ path })
  const locationRefPath = getSiblingFieldPath(path, 'locationRef')
  const { setValue: setLocationRef } = useField<string | number | null>({
    path: locationRefPath,
  })
  const {
    value: _locationFinalized,
    setValue: setLocationFinalized,
  } = useField<boolean>({
    path: path ? `${path}_finalized` : 'location_finalized',
  })

  // Read form context (for conditional rendering)
  const step1Complete = useFormFields(([fields]) => fields.step1_complete?.value) as boolean
  const inUpdateMode = useFormFields(([fields]) => fields.in_update_mode?.value) as boolean

  // ==================== Data Loading ====================
  // Fetch location hierarchy from API
  const { countries, isLoading, allLocations } = useLocationData()

  // ==================== Selection State ====================
  // Manage country > city > neighborhood cascading selections
  const {
    cities,
    neighborhoods,
    selectedCountry,
    selectedCity,
    selectedNeighborhood,
    setSelectedCountry,
    setSelectedCity,
    setSelectedNeighborhood,
  } = useLocationSelection(value, isLoading, allLocations)

  // ==================== UI State ====================
  // Manage picker expanded/collapsed state and Done button detection
  const { isExpanded, setIsExpanded, doneWasClicked } = usePickerExpanded(value)

  // ==================== Form Sync Hooks ====================
  // Effect 1: Update form field value when a selection is made
  // Only runs when user is actively editing (isExpanded === true)
  useEffect(() => {
    if (!isExpanded) return

    if (selectedNeighborhood) {
      const selected = neighborhoods.find(
        (n) => n.id === parseInt(selectedNeighborhood)
      )
      if (selected) {
        setValue(selected.locationKey)
        setLocationRef(selected.id)
      }
    } else if (selectedCity) {
      const selected = cities.find((c) => c.id === parseInt(selectedCity))
      if (selected) {
        setValue(selected.locationKey)
        setLocationRef(selected.id)
      }
    } else if (selectedCountry) {
      const selected = countries.find((c) => c.id === parseInt(selectedCountry))
      if (selected) {
        setValue(selected.locationKey)
        setLocationRef(selected.id)
      }
    }
  }, [
    selectedCountry,
    selectedCity,
    selectedNeighborhood,
    setValue,
    setLocationRef,
    cities,
    neighborhoods,
    countries,
    isExpanded,
  ])

  // Effect 2: Set finalization flag when Done is clicked
  useEffect(() => {
    if (doneWasClicked && value) {
      setLocationFinalized(true)
    }
  }, [doneWasClicked, value, setLocationFinalized])

  // ==================== Event Handlers ====================
  const handleToggleExpanded = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsExpanded(!isExpanded)
  }

  const handleOpenPicker = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsExpanded(true)
  }

  // ==================== Render ====================
  if (step1Complete && !inUpdateMode) {
    return (
      <div className="field-type">
        <label className="field-label">
          Location <span className="required">*</span>
        </label>
        <div
          style={{
            padding: '12px',
            backgroundColor: 'var(--theme-elevation-50)',
            border: '1px solid var(--theme-elevation-100)',
            borderRadius: '4px',
            color: 'var(--theme-elevation-800)',
          }}
        >
          <span style={{ fontSize: '14px', fontWeight: 500 }}>
            {formatLocationForDisplay(value, allLocations) || 'No location selected'}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="field-type">
      <label className="field-label">
        Location <span className="required">*</span>
      </label>
      <div className={styles.container}>
        {value ? (
          <LocationDisplayBox
            value={value}
            isExpanded={isExpanded}
            onToggle={handleToggleExpanded}
            locations={allLocations}
          />
        ) : (
          <AddLocationButton onOpen={handleOpenPicker} />
        )}

        {isExpanded && (
          <LocationDropdowns
            countries={countries}
            cities={cities}
            neighborhoods={neighborhoods}
            selectedCountry={selectedCountry}
            selectedCity={selectedCity}
            selectedNeighborhood={selectedNeighborhood}
            onCountryChange={setSelectedCountry}
            onCityChange={setSelectedCity}
            onNeighborhoodChange={setSelectedNeighborhood}
          />
        )}
      </div>
    </div>
  )
}

export default LocationPickerField

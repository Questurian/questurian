/**
 * Hook to synchronize location picker state with Payload form fields
 *
 * Handles:
 * - Writing selected location to the form field (country|city|neighborhood)
 * - Setting the location_finalized flag when user completes selection
 * - Reading form context (step1_complete, in_update_mode) for conditional rendering
 * - Form field type-safety with Payload's useField hook
 *
 * This hook decouples form integration from UI state management,
 * making LocationPickerField simpler and easier to understand
 */

import { useEffect } from 'react'
import { useField, useFormFields } from '@payloadcms/ui'
import type { LocationOption } from '../types'

const getSiblingFieldPath = (path: string, sibling: string) => {
  if (!path) return sibling
  const parts = path.split('.')
  parts[parts.length - 1] = sibling
  return parts.join('.')
}

interface UseLocationFormSyncProps {
  path: string
  selectedCountry: string
  selectedCity: string
  selectedNeighborhood: string
  allOptions: {
    countries: LocationOption[]
    cities: LocationOption[]
    neighborhoods: LocationOption[]
  }
  isExpanded: boolean
  doneWasClicked: boolean
}

/**
 * Effect 1: Update form field value when a location is selected
 * Only runs when user is actively editing (isExpanded === true)
 * Prevents overwriting saved values during initial load
 */
const useUpdateFormFieldEffect = (
  selectedCountry: string,
  selectedCity: string,
  selectedNeighborhood: string,
  allOptions: UseLocationFormSyncProps['allOptions'],
  isExpanded: boolean,
  setValue: (value: string) => void,
  setLocationRef: (value: string | number | null) => void
) => {
  useEffect(() => {
    // Only update form value when user is actively editing
    if (!isExpanded) return

    if (selectedNeighborhood) {
      const selected = allOptions.neighborhoods.find(
        (n) => n.id === parseInt(selectedNeighborhood)
      )
      if (selected?.locationKey) {
        setValue(selected.locationKey)
        setLocationRef(selected.id)
      }
    } else if (selectedCity) {
      const selected = allOptions.cities.find(
        (c) => c.id === parseInt(selectedCity)
      )
      if (selected?.locationKey) {
        setValue(selected.locationKey)
        setLocationRef(selected.id)
      }
    } else if (selectedCountry) {
      const selected = allOptions.countries.find(
        (c) => c.id === parseInt(selectedCountry)
      )
      if (selected?.locationKey) {
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
    allOptions,
    isExpanded,
  ])
}

/**
 * Effect 2: Set finalization flag when Done is clicked
 */
const useSetFinalizationFlagEffect = (
  doneWasClicked: boolean,
  value: string,
  setLocationFinalized: (flag: boolean) => void
) => {
  useEffect(() => {
    if (doneWasClicked && value) {
      setLocationFinalized(true)
    }
  }, [doneWasClicked, value, setLocationFinalized])
}

/**
 * Main hook: Synchronize location picker with form
 */
export const useLocationFormSync = ({
  path,
  selectedCountry,
  selectedCity,
  selectedNeighborhood,
  allOptions,
  isExpanded,
  doneWasClicked,
}: UseLocationFormSyncProps) => {
  // Get form field setters
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

  // Read form context (for conditional rendering in component)
  const step1Complete = useFormFields(([fields]) => fields.step1_complete?.value) as boolean
  const inUpdateMode = useFormFields(([fields]) => fields.in_update_mode?.value) as boolean

  // Update form field when selection changes
  useUpdateFormFieldEffect(
    selectedCountry,
    selectedCity,
    selectedNeighborhood,
    allOptions,
    isExpanded,
    setValue,
    setLocationRef
  )

  // Set finalization flag when Done is clicked
  useSetFinalizationFlagEffect(doneWasClicked, value, setLocationFinalized)

  return {
    value,
    step1Complete,
    inUpdateMode,
  }
}

/**
 * Shared exports for location picker functionality
 * Centralized utilities, types, components, and hooks for location selection
 * Used across features that need location hierarchy selection (country > city > neighborhood)
 */

// Main component
export { LocationPickerField } from './LocationPickerField'

// Components
export { SelectField, LocationDisplayBox, AddLocationButton, LocationDropdowns } from './components'

// Custom hooks
export {
  useLocationData,
  useLocationSelection,
  usePickerExpanded,
  useDetectChange,
  useLocationFormSync,
} from './hooks'

// Types
export type { LocationOption, LocationPickerValue, LocationPickerFieldProps } from './types'

// Utilities
export {
  parseLocationValue,
  formatLocationName,
  formatLocationForDisplay,
  filterCitiesByCountry,
  filterNeighborhoodsByCity,
} from './utils'

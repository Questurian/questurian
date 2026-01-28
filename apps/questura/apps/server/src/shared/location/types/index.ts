/**
 * Type definitions for location picker and data collections
 */

export interface LocationOption {
  id: number | string
  level?: 'country' | 'city' | 'neighborhood'
  country?: string
  city?: string
  neighborhood?: string
  locationKey?: string
  parentKey?: string | null
  countryName?: string
  cityName?: string
  neighborhoodName?: string
  [key: string]: any
}

export interface LocationPickerValue {
  country: string | null
  city: string | null
  neighborhood: string | null
}

export interface LocationPickerFieldProps {
  path: string
  [key: string]: any
}

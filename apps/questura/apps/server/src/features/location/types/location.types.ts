export type LocationLevel = 'country' | 'city' | 'neighborhood'

export type LocationInput = {
  level?: LocationLevel
  country?: string | null
  city?: string | null
  neighborhood?: string | null
  countryName?: string | null
  cityName?: string | null
  neighborhoodName?: string | null
  parentKey?: string | null
}

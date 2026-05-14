import type { LocationGuideRecord } from '@/shared/lib/locationGuideResolution'
import type { LocationLevel } from '@/shared/lib/locationGuideContract'

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

export type LocationReadDoc = {
  id?: string | number
  level?: LocationLevel
  locationKey?: string | null
  parentKey?: string | null
  guide?: LocationGuideRecord | null
}

export type CurrencyMetaDoc = {
  id: number
  code?: string | null
  name?: string | null
  symbol?: string | null
  displaySymbol?: string | null
  defaultLocale?: string | null
  decimalPlaces?: number | null
  latestUsdRate?: {
    unitsPerUsd?: number | null
    provider?: string | null
    sourceUpdatedAt?: string | null
    nextUpdateAt?: string | null
    fetchedAt?: string | null
  } | null
}

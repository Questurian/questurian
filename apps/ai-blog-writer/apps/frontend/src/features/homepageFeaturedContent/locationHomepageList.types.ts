import type { LocationHomepageListItem } from './locationHomepages'

export type CityHomepageGroup = {
  key: string
  cityLabel: string
  cityHomepage: LocationHomepageListItem | null
  neighborhoodHomepages: LocationHomepageListItem[]
}

export type CountryHomepageGroup = {
  key: string
  countryLabel: string
  cityGroups: CityHomepageGroup[]
}

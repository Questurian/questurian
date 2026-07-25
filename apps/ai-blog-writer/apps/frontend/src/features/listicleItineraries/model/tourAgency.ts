import type { RelatedItemCollection } from './blockTypes'

export type TourAgencyKeyLocationSource = 'existing' | 'manual'

export const TOUR_AGENCY_PRICE_TIERS = ['$', '$$', '$$$', '$$$$'] as const

export type TourAgencyPriceTier = (typeof TOUR_AGENCY_PRICE_TIERS)[number]

export function isTourAgencyPriceTier(
  value: unknown
): value is TourAgencyPriceTier {
  return value === '$' || value === '$$' || value === '$$$' || value === '$$$$'
}

export type TourAgencyStartingPoint = {
  label: string
  latitude: string
  longitude: string
}

export type TourAgencyKeyLocationRow = {
  id: string
  source: TourAgencyKeyLocationSource
  relatedCollection: RelatedItemCollection | null
  relatedItem: number | null
  title: string
  latitude: string
  longitude: string
}

export type ItineraryBlockType =
  | 'itinerary-dining'
  | 'itinerary-accommodations'
  | 'itinerary-where-staying'
  | 'itinerary-attractions'
  | 'itinerary-nightlife'
  | 'itinerary-key-location'
  | 'itinerary-tour-agency'

export const TOUR_AGENCY_BLOCK_TYPE = 'itinerary-tour-agency'

export function isManualItineraryBlockType(
  blockType: ItineraryBlockType
): boolean {
  return blockType === TOUR_AGENCY_BLOCK_TYPE
}

export const WHERE_STAYING_BLOCK_TYPE = 'itinerary-where-staying' as const

export function isWhereStayingBlockType(
  blockType: ItineraryBlockType
): boolean {
  return blockType === WHERE_STAYING_BLOCK_TYPE
}

export type RelatedItemCollection =
  | 'dining'
  | 'accommodations'
  | 'attractions'
  | 'nightlife'
  | 'key-locations'

export function isRelatedItemCollection(
  value: unknown
): value is RelatedItemCollection {
  return (
    value === 'dining' ||
    value === 'accommodations' ||
    value === 'attractions' ||
    value === 'nightlife' ||
    value === 'key-locations'
  )
}

export function relatedCollectionToBlockType(
  collection: RelatedItemCollection
): ItineraryBlockType {
  switch (collection) {
    case 'dining':
      return 'itinerary-dining'
    case 'accommodations':
      return 'itinerary-accommodations'
    case 'attractions':
      return 'itinerary-attractions'
    case 'nightlife':
      return 'itinerary-nightlife'
    case 'key-locations':
      return 'itinerary-key-location'
  }
}

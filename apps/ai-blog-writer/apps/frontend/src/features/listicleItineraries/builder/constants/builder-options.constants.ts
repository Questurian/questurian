import type {
  ItineraryBlockType,
  RelatedItemOption,
} from '../../types'

export const BLOCK_TYPE_OPTIONS: Array<{ label: string; value: ItineraryBlockType }> = [
  { label: 'Dining Stop (restaurants, cafes)', value: 'itinerary-dining' },
  { label: 'Accommodation Stop (hotel check-in, stay)', value: 'itinerary-accommodations' },
  { label: 'Attraction Stop (landmarks, activities)', value: 'itinerary-attractions' },
  { label: 'Nightlife Stop (bars, clubs, evening)', value: 'itinerary-nightlife' },
  { label: 'Key Location Stop (areas, transit hubs)', value: 'itinerary-key-location' },
  { label: 'Tour Agency Stop (manual listing)', value: 'itinerary-tour-agency' },
]

export const EMPTY_RELATED_BY_BLOCK_TYPE: Record<ItineraryBlockType, RelatedItemOption[]> = {
  'itinerary-dining': [],
  'itinerary-accommodations': [],
  'itinerary-attractions': [],
  'itinerary-nightlife': [],
  'itinerary-key-location': [],
  'itinerary-tour-agency': [],
}

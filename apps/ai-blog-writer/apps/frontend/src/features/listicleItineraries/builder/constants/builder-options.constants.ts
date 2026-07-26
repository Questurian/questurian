import type {
  ItineraryBlockType,
  RelatedItemOption,
} from '../../types'

/** Matches Payload / builder setup: 1–7 day itineraries. */
export const ITINERARY_DAY_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7] as const

export const BLOCK_TYPE_OPTIONS: Array<{ label: string; value: ItineraryBlockType }> = [
  { label: 'Dining Stop (restaurants, cafes)', value: 'itinerary-dining' },
  { label: 'Accommodation Stop (hotel check-in, stay)', value: 'itinerary-accommodations' },
  { label: "Where You're Staying (nightly lodging)", value: 'itinerary-where-staying' },
  { label: 'Attraction Stop (landmarks, activities)', value: 'itinerary-attractions' },
  { label: 'Nightlife Stop (bars, clubs, evening)', value: 'itinerary-nightlife' },
  { label: 'Key Location Stop (areas, transit hubs)', value: 'itinerary-key-location' },
  { label: 'Tour Agency Stop (manual listing)', value: 'itinerary-tour-agency' },
]

/** Step 3 “Stops” section — lodging uses the separate Where you're staying section. */
export const BLOCK_TYPE_OPTIONS_STOPS = BLOCK_TYPE_OPTIONS.filter(
  (option) => option.value !== 'itinerary-where-staying',
)

/** Reader-facing category labels shared by itinerary composition requests. */
export const ITINERARY_BLOCK_CATEGORY_LABELS: Record<ItineraryBlockType, string> = {
  'itinerary-dining': 'Dining',
  'itinerary-accommodations': 'Accommodations',
  'itinerary-where-staying': "Where You're Staying",
  'itinerary-attractions': 'Attractions',
  'itinerary-nightlife': 'Nightlife',
  'itinerary-key-location': 'Key Location',
  'itinerary-tour-agency': 'Tour Agency',
}

export const EMPTY_RELATED_BY_BLOCK_TYPE: Record<ItineraryBlockType, RelatedItemOption[]> = {
  'itinerary-dining': [],
  'itinerary-accommodations': [],
  'itinerary-where-staying': [],
  'itinerary-attractions': [],
  'itinerary-nightlife': [],
  'itinerary-key-location': [],
  'itinerary-tour-agency': [],
}

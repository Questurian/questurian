import type {
  DayAudience,
  DurationMinute,
  ItineraryBlockType,
  Meridiem,
  QuarterMinute,
  RelatedItemOption,
} from '../../types'

export const DAY_AUDIENCE_OPTIONS: Array<{ label: string; value: DayAudience }> = [
  { label: 'Any Day', value: 'anyday' },
  { label: 'Weekday', value: 'weekday' },
  { label: 'Weekend', value: 'weekend' },
]

export const BLOCK_TYPE_OPTIONS: Array<{ label: string; value: ItineraryBlockType }> = [
  { label: 'Dining Stop (restaurants, cafes)', value: 'itinerary-dining' },
  { label: 'Accommodation Stop (hotel check-in, stay)', value: 'itinerary-accommodations' },
  { label: 'Attraction Stop (landmarks, activities)', value: 'itinerary-attractions' },
  { label: 'Nightlife Stop (bars, clubs, evening)', value: 'itinerary-nightlife' },
  { label: 'Key Location Stop (areas, transit hubs)', value: 'itinerary-key-location' },
  { label: 'Tour Agency Stop (manual listing)', value: 'itinerary-tour-agency' },
]

export const QUARTER_MINUTE_OPTIONS: QuarterMinute[] = ['00', '15', '30', '45']
export const DURATION_MINUTE_OPTIONS: DurationMinute[] = ['0', '15', '30', '45']
export const PERIOD_OPTIONS: Meridiem[] = ['AM', 'PM']

export const EMPTY_RELATED_BY_BLOCK_TYPE: Record<ItineraryBlockType, RelatedItemOption[]> = {
  'itinerary-dining': [],
  'itinerary-accommodations': [],
  'itinerary-attractions': [],
  'itinerary-nightlife': [],
  'itinerary-key-location': [],
  'itinerary-tour-agency': [],
}

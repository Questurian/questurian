export const ITINERARY_MOMENTS = [
  'breakfast',
  'coffee',
  'morning-walk',
  'remote-work',
  'coworking-stop',
  'lunch',
  'street-food',
  'sweet-treat',
  'culture',
  'historic-site',
  'museum-visit',
  'landmark',
  'guided-tour',
  'local-market',
  'shopping',
  'outdoor',
  'beach-time',
  'scenic-viewpoint',
  'wellness-break',
  'active-adventure',
  'boat-ride',
  'day-trip',
  'in-transit',
  'sunset',
  'rooftop-stop',
  'dinner',
  'cocktails',
  'drinks',
  'nightlife'
] as const

export type ItineraryMoment = (typeof ITINERARY_MOMENTS)[number]

const ITINERARY_MOMENT_SET = new Set<string>(ITINERARY_MOMENTS)

export function isItineraryMoment(value: unknown): value is ItineraryMoment {
  return typeof value === 'string' && ITINERARY_MOMENT_SET.has(value)
}

/** Everyday travel moments first; work, excursions, and niche activities stay discoverable. */
export const EVERYDAY_ITINERARY_MOMENTS: ReadonlySet<ItineraryMoment> = new Set([
  'breakfast', 'coffee', 'morning-walk', 'lunch', 'street-food', 'sweet-treat',
  'culture', 'historic-site', 'museum-visit', 'landmark', 'local-market',
  'shopping', 'outdoor', 'scenic-viewpoint', 'sunset', 'dinner', 'drinks',
])

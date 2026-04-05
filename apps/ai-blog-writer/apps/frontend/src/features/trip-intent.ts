export const TRIP_INTENT_OPTIONS = [
  {
    value: 'explore',
    label: 'Explore & Sightsee',
    description: 'Must-sees, iconic stops, and first-timer highlights.',
  },
  {
    value: 'stay',
    label: 'Stay & Unwind',
    description: 'Relaxed pacing, scenic comfort, and slower days.',
  },
  {
    value: 'move',
    label: 'Road Trip & Transit',
    description: 'Easy stopovers, quick wins, and getting-around value.',
  },
  {
    value: 'family',
    label: 'Family Friendly',
    description: 'Kid-friendly picks, easy logistics, and flexible pacing.',
  },
  {
    value: 'couples',
    label: 'Couples & Romance',
    description: 'Date-worthy spots, views, and intimate experiences.',
  },
  {
    value: 'solo',
    label: 'Solo Friendly',
    description: 'Easy to do alone, approachable, and confidence-building.',
  },
  {
    value: 'culture',
    label: 'Culture & History',
    description: 'Museums, heritage, and stronger local context.',
  },
  {
    value: 'outdoors',
    label: 'Outdoors & Adventure',
    description: 'Viewpoints, nature, active days, and fresh-air stops.',
  },
  {
    value: 'food-nightlife',
    label: 'Food & Nightlife',
    description: 'Markets, tastings, bars, and evening energy.',
  },
  {
    value: 'budget',
    label: 'Budget & Value',
    description: 'Lower-cost picks, freebies, and solid payoff per dollar.',
  },
  {
    value: 'luxury',
    label: 'Luxury & Design',
    description: 'Premium service, polished spaces, and elevated experiences.',
  },
] as const

export type TripIntent = (typeof TRIP_INTENT_OPTIONS)[number]['value']
export type TripIntentOption = (typeof TRIP_INTENT_OPTIONS)[number]

export const DEFAULT_TRIP_INTENT: TripIntent[] = ['explore']

const lowerCasedOptions = new Map<string, TripIntent>(
  TRIP_INTENT_OPTIONS.map((option) => [option.value.toLowerCase(), option.value]),
)

const toTripIntent = (value: unknown): TripIntent | null => {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return lowerCasedOptions.get(normalized) ?? null
}

export function normalizeTripIntent(rawValues?: unknown): TripIntent[] {
  if (!Array.isArray(rawValues) || rawValues.length === 0) {
    return [...DEFAULT_TRIP_INTENT]
  }

  const deduped = new Set<TripIntent>()
  for (const value of rawValues) {
    const normalized = toTripIntent(value)
    if (normalized) {
      deduped.add(normalized)
    }
  }

  return deduped.size > 0 ? Array.from(deduped) : [...DEFAULT_TRIP_INTENT]
}

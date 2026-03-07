export const TRIP_INTENT_OPTIONS = ['explore', 'stay', 'move'] as const

export type TripIntent = (typeof TRIP_INTENT_OPTIONS)[number]

export const DEFAULT_TRIP_INTENT: TripIntent[] = ['explore']

const lowerCasedOptions = new Set<string>(TRIP_INTENT_OPTIONS.map((value) => value))

const toTripIntent = (value: unknown): TripIntent | null => {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return lowerCasedOptions.has(normalized) ? (normalized as TripIntent) : null
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

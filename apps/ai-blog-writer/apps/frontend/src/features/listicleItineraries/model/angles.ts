import type { ItineraryBlockType } from './blockTypes'

/**
 * Per-item editorial angle + list tone for itinerary stops.
 *
 * These mirror the single-type listicle pools: each itinerary stop reuses the
 * angle pool of its category (dining/nightlife/accommodations/attractions),
 * and the itinerary carries one List Tone for every blurb and the intro.
 * `key-location` (no pool yet) and `tour-agency` (manual stop) carry no angle.
 * The backend (`editor_assist/listicle_writer.py`) owns the actual angle/tone
 * prompt guidance; these are only the operator-facing vocabulary.
 */
export type ListicleAngle =
  | 'signature-dish'
  | 'atmosphere'
  | 'founders-backstory'
  | 'insider-tip'
  | 'best-for'
  | 'whats-different'
  | 'best-for-night'
  | 'location-and-setting'
  | 'view-and-vista'
  | 'design-and-aesthetic'
  | 'signature-amenity'
  | 'food-and-beverage'
  | 'trip-fit'
  | 'property-backstory'
  | 'booking-tip'
  | 'signature-feature'
  | 'setting'
  | 'history-built'
  | 'visit-time-tip'
  | 'best-for-visit-type'

export type ListicleAngleOption = { value: ListicleAngle; label: string }

export const DINING_LISTICLE_ANGLE_OPTIONS: ReadonlyArray<ListicleAngleOption> =
  [
    { value: 'signature-dish', label: 'Signature Dish' },
    { value: 'atmosphere', label: 'Atmosphere' },
    { value: 'founders-backstory', label: 'Founders / Backstory' },
    { value: 'insider-tip', label: 'Insider Tip' },
    { value: 'best-for', label: 'Best-For' },
    { value: 'whats-different', label: "What's Different" }
  ]

export const NIGHTLIFE_LISTICLE_ANGLE_OPTIONS: ReadonlyArray<ListicleAngleOption> =
  [{ value: 'best-for-night', label: 'Best For Night' }]

export const ACCOMMODATIONS_LISTICLE_ANGLE_OPTIONS: ReadonlyArray<ListicleAngleOption> =
  [
    { value: 'location-and-setting', label: 'Location & Setting' },
    { value: 'view-and-vista', label: 'View & Vista' },
    { value: 'design-and-aesthetic', label: 'Design & Aesthetic' },
    { value: 'signature-amenity', label: 'Signature Amenity' },
    { value: 'food-and-beverage', label: 'Food & Beverage' },
    { value: 'trip-fit', label: 'Trip Fit' },
    { value: 'property-backstory', label: 'Property Backstory' },
    { value: 'booking-tip', label: 'Booking Tip' },
    { value: 'whats-different', label: "What's Different" }
  ]

export const ATTRACTIONS_LISTICLE_ANGLE_OPTIONS: ReadonlyArray<ListicleAngleOption> =
  [
    { value: 'signature-feature', label: 'Signature Feature' },
    { value: 'setting', label: 'Setting' },
    { value: 'history-built', label: 'History / Built' },
    { value: 'visit-time-tip', label: 'Visit-Time Tip' },
    { value: 'best-for-visit-type', label: 'Best For Visit Type' },
    { value: 'whats-different', label: "What's Different" }
  ]

/** Single-angle nightlife pool per ADR 0008; operator never has to pick. */
export const NIGHTLIFE_DEFAULT_ANGLE: ListicleAngle = 'best-for-night'

export const LISTICLE_ANGLE_OPTIONS: ReadonlyArray<ListicleAngleOption> = [
  ...DINING_LISTICLE_ANGLE_OPTIONS,
  ...NIGHTLIFE_LISTICLE_ANGLE_OPTIONS,
  ...ACCOMMODATIONS_LISTICLE_ANGLE_OPTIONS,
  ...ATTRACTIONS_LISTICLE_ANGLE_OPTIONS
]

/**
 * The angle pool offered for a stop, keyed off its block type's category.
 * `key-location` (no pool yet) and `tour-agency` (manual stop, driven by its
 * structured fields) intentionally return no angles.
 */
export function getItineraryAngleOptions(
  blockType: ItineraryBlockType
): ReadonlyArray<ListicleAngleOption> {
  switch (blockType) {
    case 'itinerary-dining':
      return DINING_LISTICLE_ANGLE_OPTIONS
    case 'itinerary-nightlife':
      return NIGHTLIFE_LISTICLE_ANGLE_OPTIONS
    case 'itinerary-accommodations':
    case 'itinerary-where-staying':
      return ACCOMMODATIONS_LISTICLE_ANGLE_OPTIONS
    case 'itinerary-attractions':
      return ATTRACTIONS_LISTICLE_ANGLE_OPTIONS
    case 'itinerary-key-location':
    case 'itinerary-tour-agency':
    default:
      return []
  }
}

export function resolveListicleAngle(value: unknown): ListicleAngle | null {
  if (typeof value !== 'string') return null
  if (LISTICLE_ANGLE_OPTIONS.some((opt) => opt.value === value)) {
    return value as ListicleAngle
  }
  return null
}

/**
 * Per-blockType coercion. Nightlife stops always resolve to best-for-night
 * because the pool is single-angle (ADR 0008). Stops with no pool
 * (`key-location`, `tour-agency`) always resolve to null. Other categories
 * keep the operator's selection if it is a valid angle, else null.
 */
export function resolveItineraryAngleForBlockType(
  blockType: ItineraryBlockType,
  value: unknown
): ListicleAngle | null {
  if (blockType === 'itinerary-nightlife') return NIGHTLIFE_DEFAULT_ANGLE
  if (getItineraryAngleOptions(blockType).length === 0) return null
  return resolveListicleAngle(value)
}

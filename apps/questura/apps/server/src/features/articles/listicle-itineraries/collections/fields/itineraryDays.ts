import { Field } from 'payload'
import { listicleItineraryStopBlocks, listicleItineraryWhereStayingBlocks } from '../../blocks'

/** Lodging rows for one itinerary day (nested under `itineraryDays`). */
export const itineraryDayWhereStaying: Field = {
  name: 'whereStaying',
  label: "Where you're staying",
  type: 'blocks',
  minRows: 0,
  maxRows: 32,
  blocks: listicleItineraryWhereStayingBlocks,
  admin: {
    description: 'Nightly lodging for this day.',
  },
}

/** Stops for one itinerary day (nested under `itineraryDays`). */
export const itineraryDayItems: Field = {
  name: 'items',
  label: 'Stops',
  type: 'blocks',
  minRows: 0,
  maxRows: 96,
  blocks: listicleItineraryStopBlocks,
  admin: {
    description: "Day's stops (dining, attractions, tours, etc.). Lodging is in Where you're staying above.",
  },
}

export const dayCount: Field = {
  name: 'dayCount',
  label: 'Number of days',
  type: 'number',
  min: 1,
  max: 7,
  defaultValue: 1,
  admin: {
    description: 'Must match the number of rows in Itinerary days (1–7).',
    condition: (data) => Boolean(data?.step1_complete && !data?.in_update_mode),
  },
}

export const itineraryDays: Field = {
  name: 'itineraryDays',
  label: 'Itinerary days',
  type: 'array',
  minRows: 1,
  maxRows: 7,
  labels: {
    singular: 'Day',
    plural: 'Days',
  },
  admin: {
    description: 'Each day has its own lodging and stops. Order is Day 1 through Day N.',
    condition: (data) => Boolean(data?.step1_complete && !data?.in_update_mode),
  },
  fields: [itineraryDayWhereStaying, itineraryDayItems],
}

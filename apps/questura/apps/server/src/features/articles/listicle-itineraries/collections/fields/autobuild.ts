import { Field } from 'payload'

/**
 * Itinerary Autobuild metadata (AI Blog Writer). Both fields are internal —
 * persisted so the plan survives a reload and can be re-generated/audited, but
 * not rendered on the public itinerary page. See AI Blog Writer ADR 0014.
 */

/** The operator's free-text creative brief — the core Autobuild input. */
export const generationBrief: Field = {
  name: 'generationBrief',
  type: 'textarea',
  required: false,
  admin: {
    description:
      'AI Autobuild brief: describe the intended experience (e.g. "luxury foodie day, fine dining, rooftop drinks, easy access"). Internal — not shown publicly.',
    condition: (data) => Boolean(data?.step1_complete),
  },
}

/** Trip-level rationale for the whole itinerary's shape, written by Autobuild. */
export const planOverview: Field = {
  name: 'planOverview',
  type: 'textarea',
  required: false,
  admin: {
    description:
      'AI Autobuild overview: the day-by-day logic behind this plan (internal). Companion to per-stop selection reasons.',
    condition: (data) => Boolean(data?.step1_complete && !data?.in_update_mode),
  },
}

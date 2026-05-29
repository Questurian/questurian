import { Field } from 'payload'

/**
 * Optional per-stop editorial angle for an itinerary stop.
 *
 * Itinerary stops span every venue category, so this field lists the full union
 * of angle values across dining, nightlife, accommodations, and attractions. The
 * AI Blog Writer scopes the operator's choices to the stop's category pool; this
 * field only needs to be able to store any of them so a selection round-trips on
 * sync. `key-location` and `tour-agency` stops carry no angle and omit this field.
 */
export const angleField: Field = {
  name: 'angle',
  type: 'select',
  required: false,
  options: [
    // Dining
    { label: 'Signature Dish', value: 'signature-dish' },
    { label: 'Atmosphere', value: 'atmosphere' },
    { label: 'Founders / Backstory', value: 'founders-backstory' },
    { label: 'Insider Tip', value: 'insider-tip' },
    { label: 'Best-For', value: 'best-for' },
    { label: "What's Different", value: 'whats-different' },
    // Nightlife
    { label: 'Best For Night', value: 'best-for-night' },
    // Accommodations
    { label: 'Location & Setting', value: 'location-and-setting' },
    { label: 'View & Vista', value: 'view-and-vista' },
    { label: 'Design & Aesthetic', value: 'design-and-aesthetic' },
    { label: 'Signature Amenity', value: 'signature-amenity' },
    { label: 'Food & Beverage', value: 'food-and-beverage' },
    { label: 'Trip Fit', value: 'trip-fit' },
    { label: 'Property Backstory', value: 'property-backstory' },
    { label: 'Booking Tip', value: 'booking-tip' },
    // Attractions
    { label: 'Signature Feature', value: 'signature-feature' },
    { label: 'Setting', value: 'setting' },
    { label: 'History / Built', value: 'history-built' },
    { label: 'Visit-Time Tip', value: 'visit-time-tip' },
    { label: 'Best For Visit Type', value: 'best-for-visit-type' },
  ],
  admin: {
    description:
      "Blurb angle for AI generation, scoped to this stop's category in the AI Blog Writer. Leave empty for stops that carry no angle.",
  },
}

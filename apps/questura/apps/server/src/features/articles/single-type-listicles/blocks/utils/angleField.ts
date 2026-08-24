import { Field } from 'payload'

/**
 * Per-item editorial angles accepted from AI Blog Writer. The builder scopes
 * choices to the listicle category; Payload must store the full union because
 * every single-type block uses this shared field config.
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
    description: 'Blurb angle selected in AI Blog Writer and scoped there to this item category.',
  },
}

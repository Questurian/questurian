import type { Field } from 'payload'

export const ITINERARY_MOMENT_OPTIONS = [
  { label: 'Breakfast', value: 'breakfast' },
  { label: 'Coffee break', value: 'coffee' },
  { label: 'Morning walk', value: 'morning-walk' },
  { label: 'Remote work', value: 'remote-work' },
  { label: 'Coworking stop', value: 'coworking-stop' },
  { label: 'Lunch', value: 'lunch' },
  { label: 'Street food', value: 'street-food' },
  { label: 'Sweet treat', value: 'sweet-treat' },
  { label: 'Culture stop', value: 'culture' },
  { label: 'Historic site', value: 'historic-site' },
  { label: 'Museum visit', value: 'museum-visit' },
  { label: 'Must-see landmark', value: 'landmark' },
  { label: 'Guided tour', value: 'guided-tour' },
  { label: 'Local market', value: 'local-market' },
  { label: 'Shopping stop', value: 'shopping' },
  { label: 'Outdoor break', value: 'outdoor' },
  { label: 'Beach time', value: 'beach-time' },
  { label: 'Scenic viewpoint', value: 'scenic-viewpoint' },
  { label: 'Wellness break', value: 'wellness-break' },
  { label: 'Active adventure', value: 'active-adventure' },
  { label: 'Boat ride', value: 'boat-ride' },
  { label: 'Day trip', value: 'day-trip' },
  { label: 'In transit', value: 'in-transit' },
  { label: 'Sunset stop', value: 'sunset' },
  { label: 'Rooftop stop', value: 'rooftop-stop' },
  { label: 'Dinner', value: 'dinner' },
  { label: 'Cocktails', value: 'cocktails' },
  { label: 'Drinks', value: 'drinks' },
  { label: 'Nightlife', value: 'nightlife' },
] as const

export const itineraryMomentFields: Field[] = [
  {
    name: 'moment',
    label: 'Moment badge',
    type: 'select',
    enumName: 'itinerary_moment',
    options: [...ITINERARY_MOMENT_OPTIONS],
    admin: {
      description: 'Optional reader-facing icon and short label shown above this stop.',
    },
  },
  {
    name: 'momentLabel',
    label: 'Moment label',
    type: 'text',
    maxLength: 48,
    admin: {
      condition: (_, siblingData) => Boolean(siblingData?.moment),
      description:
        'Optional custom wording. The selected moment’s default label is used when blank.',
    },
  },
]

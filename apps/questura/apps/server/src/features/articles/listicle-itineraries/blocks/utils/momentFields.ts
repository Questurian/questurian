import type { Field } from 'payload'

export const ITINERARY_MOMENT_OPTIONS = [
  { label: 'Breakfast', value: 'breakfast' },
  { label: 'Coffee break', value: 'coffee' },
  { label: 'Lunch', value: 'lunch' },
  { label: 'Sweet treat', value: 'sweet-treat' },
  { label: 'Culture stop', value: 'culture' },
  { label: 'Must-see landmark', value: 'landmark' },
  { label: 'Shopping stop', value: 'shopping' },
  { label: 'Outdoor break', value: 'outdoor' },
  { label: 'Sunset stop', value: 'sunset' },
  { label: 'Dinner', value: 'dinner' },
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

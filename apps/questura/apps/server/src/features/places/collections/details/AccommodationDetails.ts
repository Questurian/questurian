/**
 * Accommodation Details Collection
 * Category-specific details for accommodation places (hotels, hostels, resorts, etc.)
 */

import { CollectionConfig } from 'payload'

export const accommodationTypeOptions = [
  { label: 'Hotel', value: 'hotel' },
  { label: 'Hostel', value: 'hostel' },
  { label: 'Resort', value: 'resort' },
  { label: 'Vacation Rental', value: 'vacation-rental' },
  { label: 'Villa', value: 'villa' },
  { label: 'Guesthouse', value: 'guesthouse' },
  { label: 'Boutique', value: 'boutique' },
  { label: 'Budget', value: 'budget' },
]

export const AccommodationDetails: CollectionConfig = {
  slug: 'accommodation-details',
  labels: { singular: 'Accommodation Details', plural: 'Accommodation Details' },
  admin: {
    useAsTitle: 'type',
    defaultColumns: ['place', 'type'],
    group: 'Travel Data',
    hidden: true, // Hide from main nav - managed via Places
  },
  access: {
    read: () => true,
    create: ({ req }) => req.user?.role === 'editor' || req.user?.role === 'admin',
    update: ({ req }) => req.user?.role === 'editor' || req.user?.role === 'admin',
    delete: ({ req }) => req.user?.role === 'admin',
  },
  fields: [
    {
      name: 'place',
      type: 'relationship',
      relationTo: 'places' as any,
      required: true,
      unique: true,
      admin: { description: 'The place this detail belongs to (1:1 relationship)' },
    },
    {
      name: 'type',
      type: 'select',
      options: accommodationTypeOptions,
      admin: { description: 'Type of accommodation' },
    },
  ],
}

/**
 * Attraction Details Collection
 * Category-specific details for attraction places (museums, beaches, parks, etc.)
 */

import { CollectionConfig } from 'payload'

export const attractionTypeOptions = [
  { label: 'Museum', value: 'museum' },
  { label: 'Beach', value: 'beach' },
  { label: 'Hiking Trail', value: 'hiking-trail' },
  { label: 'Historical Site', value: 'historical-site' },
  { label: 'Adventure Park', value: 'adventure-park' },
  { label: 'Gallery', value: 'gallery' },
  { label: 'Monument', value: 'monument' },
  { label: 'National Park', value: 'national-park' },
  { label: 'Workshop/Class', value: 'workshop-class' },
]

export const AttractionDetails: CollectionConfig = {
  slug: 'attraction-details',
  labels: { singular: 'Attraction Details', plural: 'Attraction Details' },
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
      relationTo: 'places',
      required: true,
      unique: true,
      admin: { description: 'The place this detail belongs to (1:1 relationship)' },
    },
    {
      name: 'type',
      type: 'select',
      options: attractionTypeOptions,
      admin: { description: 'Type of attraction' },
    },
  ],
}

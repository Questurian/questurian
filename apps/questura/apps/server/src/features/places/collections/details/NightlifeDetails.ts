/**
 * Nightlife Details Collection
 * Category-specific details for nightlife places (clubs, lounges, venues, etc.)
 */

import { staffUser } from '@/features/auth/lib/staff-user'
import { CollectionConfig } from 'payload'

export const nightlifeTypeOptions = [
  { label: 'Nightclub', value: 'nightclub' },
  { label: 'Rooftop Bar', value: 'rooftop-bar' },
  { label: 'Lounge', value: 'lounge' },
  { label: 'Karaoke', value: 'karaoke' },
  { label: 'Live Music Venue', value: 'live-music-venue' },
  { label: 'Speakeasy', value: 'speakeasy' },
  { label: 'Comedy Club', value: 'comedy-club' },
  { label: 'Pub', value: 'pub' },
]

export const NightlifeDetails: CollectionConfig = {
  slug: 'nightlife-details',
  labels: { singular: 'Nightlife Details', plural: 'Nightlife Details' },
  admin: {
    useAsTitle: 'type',
    defaultColumns: ['place', 'type'],
    group: 'Travel Data',
    hidden: true, // Hide from main nav - managed via Places
  },
  access: {
    read: () => true,
    create: ({ req }) => {
      const role = staffUser(req.user)?.role
      return role === 'editor' || role === 'admin'
    },
    update: ({ req }) => {
      const role = staffUser(req.user)?.role
      return role === 'editor' || role === 'admin'
    },
    delete: ({ req }) => staffUser(req.user)?.role === 'admin',
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
      options: nightlifeTypeOptions,
      admin: { description: 'Type of nightlife venue' },
    },
  ],
}

/**
 * Attraction Details Collection
 * Category-specific details for attraction places (museums, beaches, parks, etc.)
 */

import { staffUser } from '@/features/auth/lib/staff-user'
import { CollectionConfig } from 'payload'

export const attractionTypeOptions = [
  { label: 'Museum', value: 'museum' },
  { label: 'Gallery', value: 'gallery' },
  { label: 'Library', value: 'library' },
  { label: 'Cultural Center', value: 'cultural-center' },
  { label: 'Park', value: 'park' },
  { label: 'National Park', value: 'national-park' },
  { label: 'Botanical Garden', value: 'botanical-garden' },
  { label: 'Beach', value: 'beach' },
  { label: 'Island', value: 'island' },
  { label: 'Viewpoint', value: 'viewpoint' },
  { label: 'Waterfall', value: 'waterfall' },
  { label: 'Cave', value: 'cave' },
  { label: 'Hot Springs', value: 'hot-springs' },
  { label: 'Promenade', value: 'promenade' },
  { label: 'Walking Trail', value: 'walking-trail' },
  { label: 'Bike Trail', value: 'bike-trail' },
  { label: 'Hiking Trail', value: 'hiking-trail' },
  { label: 'Scenic Route', value: 'scenic-route' },
  { label: 'Historical Site', value: 'historical-site' },
  { label: 'Archaeological Site', value: 'archaeological-site' },
  { label: 'Ruins', value: 'ruins' },
  { label: 'Church', value: 'church' },
  { label: 'Cathedral', value: 'cathedral' },
  { label: 'Temple', value: 'temple' },
  { label: 'Landmark', value: 'landmark' },
  { label: 'Adventure Park', value: 'adventure-park' },
  { label: 'Monument', value: 'monument' },
  { label: 'Memorial', value: 'memorial' },
  { label: 'Palace', value: 'palace' },
  { label: 'Fortress', value: 'fortress' },
  { label: 'Bridge', value: 'bridge' },
  { label: 'Lighthouse', value: 'lighthouse' },
  { label: 'Plaza', value: 'plaza' },
  { label: 'Market', value: 'market' },
  { label: 'Shopping', value: 'shopping' },
  { label: 'Shopping Center', value: 'shopping-center' },
  { label: 'Mall', value: 'mall' },
  { label: 'Boardwalk', value: 'boardwalk' },
  { label: 'Entertainment', value: 'entertainment' },
  { label: 'Stadium', value: 'stadium' },
  { label: 'Observatory', value: 'observatory' },
  { label: 'Zoo', value: 'zoo' },
  { label: 'Aquarium', value: 'aquarium' },
  { label: 'Theme Park', value: 'theme-park' },
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
      options: attractionTypeOptions,
      admin: { description: 'Type of attraction' },
    },
  ],
}

/**
 * Unified POI collection for dining, accommodations, nightlife, and attractions.
 */

import type { CollectionConfig } from 'payload'
import {
  placesDeleteAccess,
  placesReadAccess,
  placesWriteAccess,
} from '../access'
import { placeFields } from './fields'
import { placeHooks } from './hooks'

export const Places: CollectionConfig = {
  slug: 'places',
  labels: { singular: 'Place', plural: 'Places' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'categories', 'location', 'status'],
    group: 'Travel Data',
  },
  access: {
    read: placesReadAccess,
    create: placesWriteAccess,
    update: placesWriteAccess,
    delete: placesDeleteAccess,
  },
  fields: placeFields,
  hooks: placeHooks,
}

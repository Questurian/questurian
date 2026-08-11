/**
 * Place Categories Collection
 * Lookup table for place categories (Dining, Accommodations, Nightlife, Attractions)
 */

import { staffUser } from '@/features/auth/lib/staff-user'
import { CollectionConfig } from 'payload'

export const PlaceCategories: CollectionConfig = {
  slug: 'place-categories',
  labels: { singular: 'Place Category', plural: 'Place Categories' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'sortOrder', 'status'],
    group: 'Tags',
  },
  access: {
    read: () => true,
    create: ({ req }) => staffUser(req.user)?.role === 'admin',
    update: ({ req }) => staffUser(req.user)?.role === 'admin',
    delete: ({ req }) => staffUser(req.user)?.role === 'admin',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      unique: true,
      admin: { description: 'Display name of the category' },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      admin: { description: 'URL-friendly identifier (e.g., dining, accommodations)' },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: { description: 'Optional description of the category' },
    },
    {
      name: 'icon',
      type: 'text',
      admin: { description: 'Optional icon identifier for UI' },
    },
    {
      name: 'sortOrder',
      type: 'number',
      defaultValue: 0,
      admin: { description: 'Display order (lower numbers first)' },
    },
    {
      name: 'status',
      type: 'select',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Inactive', value: 'inactive' },
      ],
      defaultValue: 'active',
      admin: { position: 'sidebar' },
    },
  ],
}

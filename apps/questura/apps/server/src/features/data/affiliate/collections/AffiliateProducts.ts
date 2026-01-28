/**
 * Affiliate Products Collection
 * Travel data collection for affiliate products and services
 */

import { CollectionConfig } from 'payload'

export const AffiliateProducts: CollectionConfig = {
  slug: 'affiliate-products',
  labels: { singular: 'Affiliate Product', plural: 'Affiliate Products' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'type', 'status'],
    group: 'Travel Data',
  },
  access: {
    read: ({ req }) => {
      if (!req.user) return { status: { equals: 'published' } }
      return true
    },
    create: ({ req }) => req.user?.role === 'editor' || req.user?.role === 'admin',
    update: ({ req }) => {
      // Editors and admins can update all affiliate products
      return req.user?.role === 'admin' || req.user?.role === 'editor'
    },
    delete: ({ req }) => req.user?.role === 'admin',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      unique: true,
      admin: { description: 'Product name' },
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Details',
          fields: [
            {
              name: 'type',
              type: 'select',
              options: [
                { label: 'Backpack', value: 'backpack' },
                { label: 'Luggage', value: 'luggage' },
                { label: 'Carry-On', value: 'carryon' },
                { label: 'Travel Accessory', value: 'accessory' },
                { label: 'Electronics', value: 'electronics' }, // chargers, adapters, headphones
                { label: 'Clothing', value: 'clothing' }, // jackets, shoes, etc.
                { label: 'Toiletries', value: 'toiletries' },
                { label: 'Camera Gear', value: 'cameraGear' },
                { label: 'Outdoor Gear', value: 'outdoorGear' }, // tents, sleeping bags, etc.
                { label: 'Flight', value: 'flight' },
                { label: 'Tour', value: 'tour' },
                { label: 'Activity', value: 'activity' },
                { label: 'Package', value: 'package' },
                { label: 'Service', value: 'service' },
              ],
              admin: { description: 'Type of product' },
            },
            {
              name: 'featuredImage',
              type: 'upload',
              relationTo: 'media-assets',
              admin: { description: 'Main image' },
            },
          ],
        },
      ],
    },
    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        readOnly: true,
        hidden: true,
        position: 'sidebar',
      },
    },
    {
      name: 'status',
      type: 'select',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
      ],
      defaultValue: 'draft',
      admin: { position: 'sidebar' },
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, req, operation }) => {
        if (operation === 'create' && req.user) {
          data.createdBy = req.user.id
        }

        return data
      },
    ],
  },
}

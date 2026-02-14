/**
 * Dining Collection
 * Travel data collection for restaurants, cafes, bars, and other dining establishments
 */

import { CollectionConfig } from 'payload'
import { countryCodes } from '@/shared/constants/countryCodes'
import { createLocationRefField } from '@/shared/location/server/fields'
import { syncLocationFields } from '@/shared/location/server/syncLocationFields'

export const Dining: CollectionConfig = {
  slug: 'dining',
  labels: { singular: 'Dining', plural: 'Dining' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'type', 'location', 'status'],
    group: 'Travel Data',
  },
  access: {
    read: ({ req }) => {
      if (!req.user) return { status: { equals: 'published' } }
      return true
    },
    create: ({ req }) => req.user?.role === 'editor' || req.user?.role === 'admin',
    update: ({ req }) => {
      // Editors and admins can update all dining items
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
      admin: { description: 'Dining establishment name' },
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Basic Info',
          fields: [
            {
              name: 'type',
              type: 'select',
              options: [
                { label: 'Restaurant', value: 'restaurant' },
                { label: 'Fast Food', value: 'fast-food' },
                { label: 'Food Truck', value: 'food-truck' },
                { label: 'Cafe', value: 'cafe' },
                { label: 'Bar', value: 'bar' },
                { label: 'Pub', value: 'pub' },
                { label: 'Rooftop Bar', value: 'rooftop-bar' },
                { label: 'Street Food', value: 'street-food' },
                { label: 'Brewery', value: 'brewery' },
                { label: 'Winery', value: 'winery' },
                { label: 'Seafood', value: 'seafood' },
                { label: 'Italian', value: 'italian' },
                { label: 'American', value: 'american' },
                { label: 'Wine Bar', value: 'wine-bar' },
                { label: 'Cocktail Bar', value: 'cocktail-bar' },
                { label: 'Dive Bar', value: 'dive-bar' },
                { label: 'Buffet', value: 'buffet' },
                { label: 'Bakery', value: 'bakery' },
                { label: 'Dessert', value: 'dessert' },
                { label: 'Ice Cream', value: 'ice-cream' },
                { label: 'Coffee Shop', value: 'coffee-shop' },
                { label: 'Tea Shop', value: 'tea-shop' },
                { label: 'Juice Bar', value: 'juice-bar' },
                { label: 'Smoothie Bar', value: 'smoothie-bar' },
                { label: 'Pizza', value: 'pizza' },
              ],
              admin: { description: 'Type of establishment' },
            },
            {
              name: 'priceLevel',
              type: 'select',
              options: [
                { label: '$', value: '1' },
                { label: '$$', value: '2' },
                { label: '$$$', value: '3' },
                { label: '$$$$', value: '4' },
              ],
              admin: {
                description: 'Price range indicator',
              },
            },
            {
              name: 'gallery',
              type: 'array',
              minRows: 0,
              maxRows: 20,
              admin: {
                description: 'Image gallery for this dining establishment (first image is featured)',
              },
              fields: [
                {
                  name: 'image',
                  type: 'relationship',
                  relationTo: 'media-sets',
                  required: true,
                  admin: { description: 'Gallery media set' },
                },
                {
                  name: 'altText',
                  type: 'text',
                  admin: {
                    description: 'Optional per-image alt text from Location Manager',
                  },
                },
                {
                  name: 'caption',
                  type: 'text',
                  admin: {
                    description: 'Optional per-image caption from Location Manager',
                  },
                },
                {
                  name: 'preview',
                  type: 'ui',
                  admin: {
                    components: {
                      Field: 'src/features/media/components/MediaSetPreview.tsx',
                    },
                  },
                },
              ],
            },
            {
              name: 'instagramGallery',
              type: 'array',
              label: 'Instagram Gallery',
              minRows: 0,
              maxRows: 20,
              admin: {
                description: 'Instagram posts gallery for this entry',
              },
              fields: [
                {
                  name: 'post',
                  type: 'relationship',
                  relationTo: 'instagram-posts',
                  required: false,
                  admin: {
                    allowCreate: true,
                    description: 'Select or create an Instagram post',
                  },
                },
                {
                  name: 'preview',
                  type: 'ui',
                  admin: {
                    components: {
                      Field: 'src/features/data/instagram/components/InstagramPostPreview.tsx',
                    },
                  },
                },
              ],
            },
          ],
        },
        {
          label: 'Classification',
          fields: [
            {
              name: 'cuisines',
              type: 'json',
              admin: {
                description: 'String[] cuisines',
              },
            },
            {
              name: 'idealFor',
              type: 'json',
              admin: {
                description: 'String[] ideal-for tags',
              },
            },
            {
              type: 'collapsible',
              label: 'Location Manager Enrichment',
              admin: {
                initCollapsed: true,
              },
              fields: [],
            },
          ],
        },
        {
          label: 'Location & Contact',
          fields: [
            {
              name: 'location',
              type: 'text',
              admin: {
                description: 'Select the location',
                components: {
                  Field: 'src/shared/location/LocationPickerField.tsx',
                },
              },
            },
            createLocationRefField(),
            {
              type: 'collapsible',
              label: 'Contact Information',
              admin: {
                initCollapsed: false,
              },
              fields: [
                {
                  name: 'address',
                  type: 'text',
                  admin: {
                    description: 'Google Maps URL',
                  },
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'countryCode',
                      type: 'select',
                      options: countryCodes,
                      admin: {
                        width: '30%',
                        description: 'Country Code',
                      },
                    },
                    {
                      name: 'phoneNumber',
                      type: 'text',
                      admin: {
                        description: 'Contact phone number',
                        width: '70%',
                      },
                    },
                  ],
                },
                {
                  name: 'website',
                  type: 'text',
                  admin: {
                    description: 'Website URL',
                  },
                },
                {
                  name: 'email',
                  type: 'email',
                  admin: {
                    description: 'Contact email from Location Manager',
                  },
                },
                {
                  name: 'operationHours',
                  type: 'json',
                  admin: {
                    description: 'Structured operation hours object from Location Manager',
                  },
                },
                {
                  name: 'ianaTimeId',
                  type: 'text',
                  admin: {
                    description: 'IANA timezone (example: America/Bogota)',
                  },
                  validate: (value) => {
                    if (!value) return true
                    return typeof value === 'string' && value.includes('/')
                      ? true
                      : 'Use IANA timezone format, e.g. America/Bogota'
                  },
                },
              ],
            },
            {
              type: 'collapsible',
              label: 'Coordinates',
              admin: {
                initCollapsed: false,
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'latitude',
                      type: 'number',
                      admin: {
                        width: '50%',
                      },
                    },
                    {
                      name: 'longitude',
                      type: 'number',
                      admin: {
                        width: '50%',
                      },
                    },
                  ],
                },
              ],
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
    beforeValidate: [syncLocationFields()],
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

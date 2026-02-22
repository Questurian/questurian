/**
 * Nightlife Collection
 * Travel data collection for nightclubs, lounges, bars, and other entertainment venues
 */

import { CollectionConfig } from 'payload'
import { countryCodes } from '@/shared/constants/countryCodes'
import { createLocationRefField } from '@/shared/location/server/fields'
import { syncLocationFields } from '@/shared/location/server/syncLocationFields'

export const Nightlife: CollectionConfig = {
  slug: 'nightlife',
  labels: { singular: 'Nightlife', plural: 'Nightlife' },
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
      // Editors and admins can update all nightlife items
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
      admin: { description: 'Venue name' },
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
                { label: 'Nightclub', value: 'nightclub' },
                { label: 'Rooftop Bar', value: 'rooftop-bar' },
                { label: 'Lounge', value: 'lounge' },
                { label: 'Karaoke', value: 'karaoke' },
                { label: 'Live Music Venue', value: 'live-music-venue' },
                { label: 'Speakeasy', value: 'speakeasy' },
                { label: 'Comedy Club', value: 'comedy-club' },
                { label: 'Pub', value: 'pub' },
              ],
              admin: { description: 'Type of venue' },
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
              minRows: 1,
              maxRows: 20,
              admin: {
                description: 'Image gallery for this nightlife venue (first image is featured)',
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
              name: 'idealFor',
              type: 'json',
              admin: {
                description: 'String[] ideal-for tags',
              },
            },
            {
              name: 'nightlifeDetails',
              type: 'json',
              admin: {
                description: 'Structured nightlife details JSON from Location Manager',
              },
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
          label: 'Location',
          fields: [
            {
              name: 'location',
              type: 'text',
              required: true,
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
                  validate: (value: unknown) => {
                    if (!value) return true
                    return typeof value === 'string' && value.includes('/')
                      ? true
                      : 'Use IANA timezone format, e.g. America/Bogota'
                  },
                },
                {
                  name: 'neighborhoodDescription',
                  type: 'textarea',
                  admin: {
                    description: 'Neighborhood context from Location Manager',
                    rows: 3,
                  },
                },
                {
                  name: 'tripadvisorUrl',
                  type: 'text',
                  admin: {
                    description: 'TripAdvisor URL from Location Manager',
                  },
                },
                {
                  name: 'tripadvisorLocationId',
                  type: 'text',
                  admin: {
                    description: 'TripAdvisor location ID from Location Manager',
                  },
                },
                {
                  name: 'placeId',
                  type: 'text',
                  admin: {
                    description: 'Google Place ID from Location Manager',
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

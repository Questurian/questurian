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
          label: 'Basic Info',
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
          ],
        },
        {
          label: 'Profile',
          fields: [
            {
              name: 'nightlifeDetails',
              type: 'group',
              admin: {
                description: 'Structured nightlife details from Location Manager sync',
              },
              fields: [
                {
                  type: 'tabs',
                  tabs: [
                    {
                      label: 'Core',
                      fields: [
                        {
                          name: 'core',
                          type: 'group',
                          fields: [
                            { name: 'name', type: 'text' },
                            { name: 'clubType', type: 'text' },
                            { name: 'priceTier', type: 'text' },
                            { name: 'music', type: 'text', hasMany: true },
                            { name: 'idealFor', type: 'text', hasMany: true },
                          ],
                        },
                      ],
                    },
                    {
                      label: 'Space',
                      fields: [
                        {
                          name: 'theSpace',
                          type: 'group',
                          fields: [
                            { name: 'venueType', type: 'text' },
                            { name: 'venueSize', type: 'text' },
                            { name: 'spaceLayout', type: 'text', hasMany: true },
                            { name: 'vibe', type: 'text', hasMany: true },
                            { name: 'peakHours', type: 'text' },
                          ],
                        },
                      ],
                    },
                    {
                      label: 'Scene',
                      fields: [
                        {
                          name: 'theScene',
                          type: 'group',
                          fields: [
                            { name: 'musicFormat', type: 'text', hasMany: true },
                            { name: 'touristPresence', type: 'text' },
                            { name: 'dressCode', type: 'text', hasMany: true },
                            { name: 'energyLevel', type: 'text' },
                            { name: 'vipAndBottleService', type: 'text' },
                            { name: 'crowdProfile', type: 'text' },
                          ],
                        },
                      ],
                    },
                    {
                      label: 'Logistics',
                      fields: [
                        {
                          name: 'theDetails',
                          type: 'group',
                          fields: [
                            {
                              name: 'operationHours',
                              type: 'json',
                              admin: {
                                description: 'Raw operation hours object from Location Manager',
                              },
                            },
                            { name: 'reserveUrl', type: 'text' },
                            { name: 'daytimeRestaurant', type: 'checkbox' },
                          ],
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
          label: 'Media',
          fields: [
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

/**
 * Attractions Collection
 * Travel data collection for museums, beaches, hiking trails, and other attractions
 */

import { CollectionConfig } from 'payload'
import { countryCodes } from '@/shared/constants/countryCodes'
import { createLocationRefField } from '@/shared/location/server/fields'
import { syncLocationFields } from '@/shared/location/server/syncLocationFields'
import { attractionTypeOptions } from '@/features/places/collections/details/AttractionDetails'

export const Attractions: CollectionConfig = {
  slug: 'attractions',
  labels: {
    singular: 'Attraction',
    plural: 'Attractions',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'type', 'location', 'status'],
    group: 'Travel Data',
  },
  access: {
    read: ({ req }) => {
      if (!req.user) {
        return { status: { equals: 'published' } }
      }
      return true
    },
    create: ({ req }) => req.user?.role === 'editor' || req.user?.role === 'admin',
    update: ({ req }) => {
      // Editors and admins can update all attractions
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
      admin: { description: 'Attraction name' },
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
              options: attractionTypeOptions,
              admin: { description: 'Type of attraction' },
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
          label: 'Details',
          fields: [
            {
              name: 'attractionsDetails',
              type: 'group',
              admin: {
                description: 'Structured attractions details from Location Manager',
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
                            { name: 'attractionType', type: 'text' },
                            { name: 'pricing', type: 'text' },
                          ],
                        },
                      ],
                    },
                    {
                      label: 'Visit',
                      fields: [
                        {
                          name: 'visit',
                          type: 'group',
                          fields: [
                            { name: 'bookingRequired', type: 'checkbox' },
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
                description: 'Image gallery for this attraction (first image is featured)',
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
                  name: 'operationHours',
                  type: 'json',
                  admin: {
                    description: 'Structured operation hours object from Location Manager',
                  },
                },
                {
                  name: 'countryCodeIso',
                  type: 'text',
                  admin: {
                    description: 'ISO country code from Location Manager (for example: US)',
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
                  name: 'sourceName',
                  type: 'text',
                  admin: {
                    description: 'Original source name from Location Manager',
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

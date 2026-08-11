/**
 * Dining Collection
 * Travel data collection for restaurants, cafes, bars, and other dining establishments
 */

import { staffUser } from '@/features/auth/lib/staff-user'
import { CollectionConfig } from 'payload'
import { countryCodes } from '@/shared/constants/countryCodes'
import { createLocationRefField } from '@/shared/location/server/fields'
import { syncLocationFields } from '@/shared/location/server/syncLocationFields'

const validateOperationHours = (value: unknown) => {
  if (!value) return true
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return 'Operation hours must be an object with an hours array'
  }

  const hours = (value as { hours?: unknown }).hours
  if (!Array.isArray(hours)) {
    return 'Operation hours must include hours: [{ day, hours }]'
  }

  for (const row of hours) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return 'Each operation hours row must be an object with day and hours'
    }

    const day = (row as { day?: unknown }).day
    const rowHours = (row as { hours?: unknown }).hours
    if (typeof day !== 'string' || day.trim().length === 0) {
      return 'Each operation hours row requires a non-empty day'
    }
    if (typeof rowHours !== 'string' || rowHours.trim().length === 0) {
      return 'Each operation hours row requires a non-empty hours value'
    }
  }

  return true
}

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
    create: ({ req }) => {
      const role = staffUser(req.user)?.role
      return role === 'editor' || role === 'admin'
    },
    update: ({ req }) => {
      // Editors and admins can update all dining items
      const role = staffUser(req.user)?.role
      return role === 'admin' || role === 'editor'
    },
    delete: ({ req }) => staffUser(req.user)?.role === 'admin',
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
              type: 'text',
              admin: {
                description:
                  'Type of establishment. Free text to mirror values coming from Location Manager.',
              },
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
              name: 'cuisines',
              type: 'json',
              admin: {
                description:
                  'Cuisine tags from Location Manager (stored as String[] JSON, accepts new values without enum restrictions).',
              },
            },
            {
              name: 'idealFor',
              type: 'json',
              admin: {
                description: 'String[] ideal-for tags',
              },
            },
          ],
        },
        {
          label: 'Media',
          fields: [
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
                  type: 'row',
                  fields: [
                    {
                      name: 'menuUrl',
                      type: 'text',
                      admin: {
                        description: 'Menu page URL (optional)',
                        width: '50%',
                      },
                    },
                    {
                      name: 'bookingUrl',
                      type: 'text',
                      admin: {
                        description: 'Reservation / booking URL (optional)',
                        width: '50%',
                      },
                    },
                  ],
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
                    description: 'Schema: { "hours": [{ "day": "Monday", "hours": "09:00 - 18:00" }] }',
                  },
                  validate: validateOperationHours,
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
        // Only a human is credited. A machine caller authenticates as a
        // service account (ADR-0006), whose id would otherwise be written into
        // a `users` relationship and point at an unrelated person.
        const author = staffUser(req.user)
        if (operation === 'create' && author) {
          data.createdBy = author.id
        }

        return data
      },
    ],
  },
}

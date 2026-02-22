import { CollectionConfig } from 'payload'
import { countryCodes } from '@/shared/constants/countryCodes'
import { createLocationRefField } from '@/shared/location/server/fields'
import { syncLocationFields } from '@/shared/location/server/syncLocationFields'

export const KeyLocations: CollectionConfig = {
  slug: 'key-locations',
  labels: {
    singular: 'Key Location',
    plural: 'Key Locations',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'type', 'keyLocationStatus', 'location', 'status'],
    group: 'Travel Data',
  },
  access: {
    read: ({ req }) => {
      if (!req.user) return { status: { equals: 'published' } }
      return true
    },
    create: ({ req }) => req.user?.role === 'editor' || req.user?.role === 'admin',
    update: ({ req }) => req.user?.role === 'admin' || req.user?.role === 'editor',
    delete: ({ req }) => req.user?.role === 'admin',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description: 'Key location name',
      },
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
                { label: 'Airport', value: 'airport' },
                { label: 'Bus Stop', value: 'bus_stop' },
                { label: 'Currency Exchange', value: 'currency_exchange' },
                { label: 'Bus Terminal', value: 'bus_terminal' },
              ],
              admin: {
                description: 'Type of key location',
              },
            },
          ],
        },
        {
          label: 'Profile',
          fields: [
            {
              name: 'keyLocationStatus',
              type: 'select',
              options: [
                { label: 'Active', value: 'active' },
                { label: 'Inactive', value: 'inactive' },
                { label: 'Temporarily Closed', value: 'temporarily_closed' },
                { label: 'Seasonal', value: 'seasonal' },
              ],
              admin: {
                description: 'Operational status from Location Manager',
              },
            },
          ],
        },
        {
          label: 'Details',
          fields: [
            {
              name: 'keyLocationsDetails',
              type: 'group',
              admin: {
                description: 'Structured key locations details from Location Manager',
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
                            { name: 'locationType', type: 'text' },
                            { name: 'description', type: 'textarea' },
                            { name: 'status', type: 'text' },
                            { name: 'neighborhood', type: 'text' },
                          ],
                        },
                      ],
                    },
                    {
                      label: 'Details',
                      fields: [
                        {
                          name: 'details',
                          type: 'group',
                          fields: [
                            { name: 'access', type: 'json' },
                            { name: 'info', type: 'json' },
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
              minRows: 0,
              maxRows: 20,
              admin: {
                description: 'Image gallery for this key location',
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
                description: 'Instagram posts gallery for this key location',
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
              },
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
      admin: {
        position: 'sidebar',
      },
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

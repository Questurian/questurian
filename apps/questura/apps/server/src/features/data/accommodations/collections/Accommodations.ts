/**
 * Accommodations Collection
 * Travel data collection for hotels, hostels, resorts, and other lodging options
 */

import { staffUser } from '@/features/auth/lib/staff-user'
import { CollectionConfig } from 'payload'
import { countryCodes } from '@/shared/constants/countryCodes'
import { createLocationRefField } from '@/shared/location/server/fields'
import { syncLocationFields } from '@/shared/location/server/syncLocationFields'

export const Accommodations: CollectionConfig = {
  slug: 'accommodations',
  labels: {
    singular: 'Accommodation',
    plural: 'Accommodations',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'type', 'location', 'status'],
    group: 'Travel Data',
  },
  access: {
    read: ({ req }) => {
      // Public can only read published accommodations
      if (!req.user) {
        return {
          status: {
            equals: 'published',
          },
        }
      }
      // Authenticated users can read all
      return true
    },
    create: ({ req }) => {
      // Only editors and admins can create
      const role = staffUser(req.user)?.role
      return role === 'editor' || role === 'admin'
    },
    update: ({ req }) => {
      // Editors and admins can update all accommodations
      const role = staffUser(req.user)?.role
      return role === 'admin' || role === 'editor'
    },
    delete: ({ req }) => {
      // Only admins can delete
      return staffUser(req.user)?.role === 'admin'
    },
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description: 'Accommodation name',
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
                { label: 'Hotel', value: 'hotel' },
                { label: 'Hostel', value: 'hostel' },
                { label: 'Resort', value: 'resort' },
                { label: 'Vacation Rental', value: 'vacation-rental' },
                { label: 'Villa', value: 'villa' },
                { label: 'Guesthouse', value: 'guesthouse' },
                { label: 'Boutique', value: 'boutique' },
                { label: 'Budget', value: 'budget' },
              ],
              admin: {
                description: 'Type of accommodation',
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
              type: 'tabs',
              admin: {
                description: 'Structured accommodations profile synced from Location Manager',
              },
              tabs: [
                {
                  label: 'Core',
                  fields: [
                    {
                      name: 'core',
                      type: 'group',
                      admin: {
                        description: 'Name, pricing, district, and subtype from Location Manager core section.',
                      },
                      fields: [
                        { name: 'name', type: 'text' },
                        {
                          name: 'price',
                          type: 'select',
                          options: [
                            { label: '$', value: '$' },
                            { label: '$$', value: '$$' },
                            { label: '$$$', value: '$$$' },
                            { label: '$$$$', value: '$$$$' },
                          ],
                        },
                        { name: 'district', type: 'text' },
                        { name: 'type', type: 'text' },
                      ],
                    },
                  ],
                },
                {
                  label: 'The Stay',
                  fields: [
                    {
                      name: 'theStay',
                      type: 'group',
                      admin: {
                        description: 'Practical stay amenities and family/parking/breakfast signals.',
                      },
                      fields: [
                        {
                          name: 'perfectFor',
                          type: 'select',
                          hasMany: true,
                          options: [
                            { label: 'Solo', value: 'Solo' },
                            { label: 'Couples', value: 'Couples' },
                            { label: 'Groups', value: 'Groups' },
                          ],
                        },
                        { name: 'kidFriendly', type: 'checkbox' },
                        { name: 'ac', type: 'checkbox' },
                        { name: 'wifi', type: 'checkbox' },
                        { name: 'extraGuestFee', type: 'checkbox' },
                        {
                          name: 'parking',
                          type: 'select',
                          hasMany: true,
                          options: [
                            { label: 'Onsite', value: 'onsite' },
                            { label: 'Valet', value: 'valet' },
                            { label: 'Street', value: 'street' },
                            { label: 'Garage', value: 'garage' },
                          ],
                        },
                        { name: 'breakfastServed', type: 'checkbox' },
                      ],
                    },
                  ],
                },
                {
                  label: 'The Experience',
                  fields: [
                    {
                      name: 'theExperience',
                      type: 'group',
                      admin: {
                        description: 'Atmosphere and lifestyle amenities like vibe, workspace, pool, and gym.',
                      },
                      fields: [
                        {
                          name: 'vibe',
                          type: 'select',
                          hasMany: true,
                          options: [
                            { label: 'Luxury', value: 'Luxury' },
                            { label: 'Social', value: 'Social' },
                            { label: 'Quiet', value: 'Quiet' },
                            { label: 'Boutique', value: 'Boutique' },
                            { label: 'Family-Friendly', value: 'Family-Friendly' },
                            { label: 'Business-Friendly', value: 'Business-Friendly' },
                          ],
                        },
                        {
                          name: 'workspace',
                          type: 'select',
                          options: [
                            { label: 'None', value: 'None' },
                            { label: 'Shared Lounge', value: 'Shared Lounge' },
                            { label: 'Dedicated Desk', value: 'Dedicated Desk' },
                            { label: 'Co-working Space', value: 'Co-working Space' },
                          ],
                        },
                        { name: 'restaurant', type: 'checkbox' },
                        {
                          name: 'pool',
                          type: 'select',
                          hasMany: true,
                          options: [
                            { label: 'Indoor', value: 'indoor' },
                            { label: 'Outdoor', value: 'outdoor' },
                            { label: 'Rooftop', value: 'rooftop' },
                            { label: 'Infinity', value: 'infinity' },
                          ],
                        },
                        { name: 'rooftopLounge', type: 'checkbox' },
                        {
                          name: 'jacuzzi',
                          type: 'select',
                          hasMany: true,
                          options: [
                            { label: 'Private', value: 'private' },
                            { label: 'Shared', value: 'shared' },
                            { label: 'Rooftop', value: 'rooftop' },
                          ],
                        },
                        {
                          name: 'gym',
                          type: 'select',
                          options: [
                            { label: 'None', value: 'None' },
                            { label: 'Basic', value: 'Basic' },
                            { label: 'Full', value: 'Full' },
                            { label: '24/7', value: '24/7' },
                          ],
                        },
                      ],
                    },
                  ],
                },
                {
                  label: 'The Details',
                  fields: [
                    {
                      name: 'theDetails',
                      type: 'group',
                      admin: {
                        description: 'Address and operational details like check-in/out, contact, and booking links.',
                      },
                      fields: [
                        { name: 'address', type: 'text' },
                        {
                          name: 'walkability',
                          type: 'select',
                          options: [
                            { label: 'Walkable Downtown', value: 'Walkable Downtown' },
                            { label: 'Transit-Friendly', value: 'Transit-Friendly' },
                            { label: 'Car Needed', value: 'Car Needed' },
                            { label: 'Secluded', value: 'Secluded' },
                          ],
                        },
                        { name: 'checkInTime', type: 'text' },
                        { name: 'checkOutTime', type: 'text' },
                        { name: 'phone', type: 'text' },
                        { name: 'websiteUrl', type: 'text' },
                        { name: 'bookingUrl', type: 'text' },
                        { name: 'googleMapsUrl', type: 'text' },
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
                description: 'Image gallery for this accommodation (first image is featured)',
              },
              fields: [
                {
                  name: 'image',
                  type: 'relationship',
                  relationTo: 'media-sets',
                  required: true,
                  admin: {
                    description: 'Gallery media set',
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

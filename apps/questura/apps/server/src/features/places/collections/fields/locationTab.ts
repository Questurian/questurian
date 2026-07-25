import type { Tab } from 'payload'
import { countryCodes } from '@/shared/constants/countryCodes'
import { createLocationRefField } from '@/shared/location/server/fields'

export const placeLocationTab: Tab = {
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
}

import { Block } from 'payload'

const isValidAbsoluteUrl = (value: string | null | undefined): boolean => {
  if (!value) return true

  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

const urlValidationMessage = 'Enter a valid absolute URL (for example https://example.com/page).'

const existingKeyLocationCollections = [
  'dining',
  'accommodations',
  'attractions',
  'nightlife',
  'key-locations',
] as const

const tourAgencyPriceOptions = [
  { label: '$', value: '$' },
  { label: '$$', value: '$$' },
  { label: '$$$', value: '$$$' },
  { label: '$$$$', value: '$$$$' },
] as const

export const ItineraryTourAgencyBlock: Block = {
  slug: 'itinerary-tour-agency',
  dbName: 'ita',
  labels: {
    singular: 'Tour Agency Stop',
    plural: 'Tour Agency Stops',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      admin: {
        description: 'Name of the promoted tour or tour package.',
      },
    },
    {
      name: 'operator',
      type: 'text',
      required: true,
      admin: {
        description: 'Tour operator or agency name.',
      },
    },
    {
      name: 'price',
      type: 'select',
      dbName: 'price_tier',
      enumName: 'lit_tour_price_tier',
      options: [...tourAgencyPriceOptions],
      admin: {
        description: 'Optional price tier for the tour.',
      },
    },
    {
      name: 'url',
      type: 'text',
      required: true,
      validate: (value: string | null | undefined) => (isValidAbsoluteUrl(value) ? true : urlValidationMessage),
      admin: {
        description: 'Booking or landing page URL for the tour.',
      },
    },
    {
      name: 'tourDuration',
      label: 'Tour Duration',
      type: 'number',
      required: true,
      min: 1,
      max: 24,
      defaultValue: 1,
      admin: {
        components: {
          Field: 'src/features/articles/listicle-itineraries/components/field-components/TourDurationSliderField.tsx',
        },
        description: 'Tour duration in hours.',
      },
    },
    {
      name: 'startingPoint',
      type: 'group',
      admin: {
        description: 'Optional starting point coordinates for the tour.',
      },
      fields: [
        {
          name: 'label',
          type: 'text',
          admin: {
            description: 'Optional label for the starting point.',
          },
        },
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
    {
      name: 'keyLocations',
      type: 'array',
      dbName: 'kls',
      label: 'Key Locations',
      fields: [
        {
          name: 'source',
          type: 'select',
          dbName: 'kl_source',
          enumName: 'lit_tour_kl_source',
          required: true,
          defaultValue: 'existing',
          options: [
            { label: 'Existing item', value: 'existing' },
            { label: 'Manual coordinates', value: 'manual' },
          ],
        },
        {
          name: 'relatedItem',
          type: 'relationship',
          relationTo: [...existingKeyLocationCollections],
          admin: {
            description: 'Pick an existing travel item to include in the tour route.',
            condition: (_, siblingData) => siblingData?.source === 'existing',
          },
        },
        {
          name: 'title',
          type: 'text',
          admin: {
            description: 'Manual location title.',
            condition: (_, siblingData) => siblingData?.source === 'manual',
          },
        },
        {
          type: 'row',
          admin: {
            condition: (_, siblingData) => siblingData?.source === 'manual',
          },
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
      admin: {
        description: 'Add existing travel items or manual coordinate points for the tour route.',
      },
    },
    {
      name: 'image',
      label: 'Img',
      type: 'relationship',
      relationTo: 'media-assets',
      admin: {
        description: 'Optional image for this tour agency block.',
      },
    },
    {
      name: 'instagramPost',
      label: 'Instagram',
      type: 'relationship',
      relationTo: 'instagram-posts',
      admin: {
        allowCreate: true,
        description: 'Optional Instagram embed for the tour or operator.',
      },
    },
    {
      name: 'blurb',
      type: 'richText',
      required: true,
      admin: {
        description: 'Editorial context for this stop.',
      },
    },
  ],
}

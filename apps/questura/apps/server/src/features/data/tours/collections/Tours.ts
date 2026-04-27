import { CollectionConfig } from 'payload'

const urlValidationMessage = 'Enter a valid absolute URL, for example https://example.com/tour.'

const isValidAbsoluteUrl = (value: string | null | undefined): boolean => {
  if (!value) return false

  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

export const Tours: CollectionConfig = {
  slug: 'tours',
  labels: {
    singular: 'Tour',
    plural: 'Tours',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'locationRef', 'price', 'status', 'updatedAt'],
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
        description: 'Tour title from Location Manager',
      },
    },
    {
      name: 'img',
      label: 'Img',
      type: 'relationship',
      relationTo: 'media-sets',
      required: true,
      admin: {
        description: 'Tour image media set',
      },
    },
    {
      name: 'bookingLink',
      type: 'text',
      required: true,
      validate: (value: string | null | undefined) =>
        isValidAbsoluteUrl(value) ? true : urlValidationMessage,
      admin: {
        description: 'Booking or landing page URL',
      },
    },
    {
      name: 'price',
      type: 'text',
      required: true,
      admin: {
        description: 'Flexible display price, for example "$45" or "From $45"',
      },
    },
    {
      name: 'locationRef',
      label: 'Place / geography',
      type: 'relationship',
      relationTo: 'locations',
      required: false,
      admin: {
        description:
          'Site organization: geography for this tour. Set from Location Manager (tour location key) and synced with Payload.',
        position: 'sidebar',
      },
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

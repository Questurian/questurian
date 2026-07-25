import type { Tab } from 'payload'

export const placeDetailsTab: Tab = {
  label: 'Details',
  fields: [
    {
      name: 'gallery',
      type: 'array',
      minRows: 0,
      maxRows: 20,
      admin: {
        description: 'Image gallery for this place (first image is featured)',
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
        description: 'Instagram posts gallery for this place',
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
}

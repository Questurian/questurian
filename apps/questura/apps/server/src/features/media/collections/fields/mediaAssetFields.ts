import type { Field } from 'payload'
import { createLocationRefField } from '@/shared/location/server/fields'
import { MEDIA_VARIANT_OPTIONS } from '@/features/media/constants'

export const mediaAssetFields: Field[] = [
  {
    name: 'user',
    type: 'relationship',
    relationTo: 'users',
    admin: {
      description: 'Link avatar images to user profiles (optional)',
    },
  },
  {
    name: 'uploadedBy',
    type: 'text',
    admin: {
      readOnly: true,
      hidden: true,
    },
  },
  {
    name: 'bunny_original_url',
    type: 'text',
    required: false,
    admin: {
      readOnly: true,
      position: 'sidebar',
      description: 'Auto-filled for original uploads that are exactly 1200x630.',
    },
  },
  {
    name: 'mediaSet',
    type: 'relationship',
    relationTo: 'media-sets',
    required: false,
    admin: {
      position: 'sidebar',
      description:
        'Link this asset to an existing media set. Leave blank for carve-out uploads (profile, inline body, external).',
    },
  },
  {
    name: 'variant',
    type: 'select',
    options: MEDIA_VARIANT_OPTIONS,
    required: false,
    admin: {
      position: 'sidebar',
      description:
        'Variant role this asset plays inside the media set. Requires the media set above to already exist; new media sets are created via POST /api/media-sets/from-source.',
    },
  },
  {
    name: 'alt_text',
    type: 'text',
    required: false,
    admin: {
      description:
        'Describe the image for accessibility and SEO (e.g., "Sunset over Miraflores beach in Lima")',
      placeholder: 'Descriptive text for screen readers and search engines',
    },
  },
  {
    name: 'photographer_credit',
    type: 'text',
    required: false,
    admin: {
      description: 'Optional attribution (e.g., "Photo by John Smith" or "Unsplash/username")',
      placeholder: 'Photographer name or source',
    },
  },
  {
    name: 'location',
    type: 'text',
    required: false,
    admin: {
      position: 'sidebar',
      description: 'Select the location featured in this image (optional)',
      components: {
        Field: 'src/shared/location/LocationPickerField.tsx',
      },
    },
  },
  createLocationRefField(),
  {
    name: 'location_finalized',
    type: 'checkbox',
    defaultValue: false,
    admin: {
      hidden: true,
    },
  },
  {
    name: 'tags',
    type: 'relationship',
    relationTo: 'article-tags',
    hasMany: true,
    maxRows: 10,
    required: false,
    admin: {
      position: 'sidebar',
      description: 'Select up to 10 relevant tags (e.g., sunset, beach, food, architecture)',
      disableListFilter: true,
    },
  },
]

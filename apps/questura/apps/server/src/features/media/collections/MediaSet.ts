/**
 * MediaSet Collection - groups related media variants into a single API object
 */

import type { CollectionConfig, Field } from 'payload'
import { createLocationRefField } from '@/shared/location/server/fields'
import { syncLocationFields } from '@/shared/location/server/syncLocationFields'
import {
  MEDIA_VARIANT_KEYS,
  MEDIA_VARIANT_OPTIONS,
  type MediaVariantKey,
} from '@/features/media/constants'

const VARIANT_HELP_TEXT: Record<MediaVariantKey, string> = {
  thumbnail: '3:2 crop for cards and listings',
  square: '1:1 crop for grids and avatars',
  wide: '16:9 crop for wide placements',
  portrait: '4:5 crop for vertical placements',
  hero: '21:9 crop for hero banners',
  open_graph: 'Open Graph/social share crop (1.91:1) - Pexels 1200x630, export 1200x630',
  editorial: 'Editorial/news crop (4:3) - Pexels 1600x1200, export 1600x1200',
}

const variantFields: Field[] = MEDIA_VARIANT_OPTIONS.map((variant) => ({
  name: variant.value,
  label: variant.label,
  type: 'relationship',
  relationTo: 'media-assets',
  admin: {
    description: VARIANT_HELP_TEXT[variant.value as MediaVariantKey],
  },
}))

const getVariantValue = (
  dataVariants: Record<string, unknown> | undefined,
  originalVariants: Record<string, unknown> | undefined,
  key: MediaVariantKey
) => {
  if (dataVariants && Object.prototype.hasOwnProperty.call(dataVariants, key)) {
    return dataVariants[key]
  }
  return originalVariants?.[key]
}

export const MediaSet: CollectionConfig = {
  slug: 'media-sets',
  labels: {
    singular: 'Media Set',
    plural: 'Media Sets',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'location', 'createdAt', 'createdBy'],
    group: 'Media',
    description: 'Group related media variants into a single API object',
    hidden: ({ user }) => {
      return user?.role === 'user' || !user
    },
  },
  access: {
    read: ({ req }) => {
      if (!req.user) return true
      if (
        req.user.role === 'admin' ||
        req.user.role === 'editor' ||
        req.user.role === 'writer'
      )
        return true
      return false
    },
    create: ({ req }) => {
      return (
        req.user?.role === 'editor' ||
        req.user?.role === 'admin' ||
        req.user?.role === 'writer'
      )
    },
    update: ({ req }) => {
      if (!req.user) return false
      if (req.user.role === 'admin' || req.user.role === 'editor') return true
      if (req.user.role === 'writer') {
        return {
          createdBy: {
            equals: req.user.id,
          },
        }
      }
      return false
    },
    delete: ({ req }) => {
      if (!req.user) return false
      if (req.user.role === 'admin' || req.user.role === 'editor') return true
      if (req.user.role === 'writer') {
        return {
          createdBy: {
            equals: req.user.id,
          },
        }
      }
      return false
    },
  },
  hooks: {
    beforeValidate: [syncLocationFields()],
    beforeChange: [
      ({ data, req, operation, originalDoc }) => {
        if (!data) return data

        if (operation === 'create' && req.user) {
          data.createdBy = req.user.id
        }

        const dataVariants = (data.variants as Record<string, unknown> | undefined) ?? undefined
        const originalVariants =
          (originalDoc?.variants as Record<string, unknown> | undefined) ?? undefined

        const isComplete = MEDIA_VARIANT_KEYS.every((key) =>
          Boolean(getVariantValue(dataVariants, originalVariants, key))
        )

        data.status = isComplete ? 'complete' : 'partial'
        return data
      },
    ],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      admin: {
        description: 'Short label for admin display (e.g., "La Cervecera exterior")',
      },
    },
    {
      name: 'alt_text',
      type: 'text',
      required: false,
      admin: {
        description: 'Canonical alt text for all variants (can be overridden per asset)',
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
      name: 'variants',
      type: 'group',
      fields: variantFields,
      admin: {
        description: 'Attach the variant assets that belong to this media set',
      },
    },
    {
      name: 'externalRef',
      type: 'text',
      unique: true,
      admin: {
        position: 'sidebar',
        description: 'Optional stable ID from the external app for idempotent imports',
      },
    },
    {
      name: 'status',
      type: 'select',
      options: [
        { label: 'Partial', value: 'partial' },
        { label: 'Complete', value: 'complete' },
      ],
      defaultValue: 'partial',
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Auto-computed based on which variants are present',
      },
    },
    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        readOnly: true,
        hidden: true,
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
  ],
}

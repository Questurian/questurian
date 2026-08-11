/**
 * MediaSet Collection - groups related media variants into a single API object
 */

import { staffUser } from '@/features/auth/lib/staff-user'
import { serviceAccountHasCollectionGrant } from '@/features/auth/lib/service-account-grants'
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
    defaultColumns: ['title', 'placement_readiness', 'status', 'location', 'createdAt', 'createdBy'],
    group: 'Media',
    description: 'Group related media variants into a single API object',
    hidden: ({ user }) => {
      return !user
    },
  },
  access: {
    read: ({ req }) => {
      if (!req.user) return true
      if (
        serviceAccountHasCollectionGrant(req.user, 'media-sets', 'read') ||
        staffUser(req.user)?.role === 'admin' ||
        staffUser(req.user)?.role === 'editor' ||
        staffUser(req.user)?.role === 'writer'
      )
        return true
      return false
    },
    create: ({ req }) => {
      return (
        serviceAccountHasCollectionGrant(req.user, 'media-sets', 'create') ||
        staffUser(req.user)?.role === 'editor' ||
        staffUser(req.user)?.role === 'admin' ||
        staffUser(req.user)?.role === 'writer'
      )
    },
    update: ({ req }) => {
      if (!req.user) return false
      if (serviceAccountHasCollectionGrant(req.user, 'media-sets', 'update')) return true
      const role = staffUser(req.user)?.role
      if (role === 'admin' || role === 'editor') return true
      if (staffUser(req.user)?.role === 'writer') {
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
      const role = staffUser(req.user)?.role
      if (role === 'admin' || role === 'editor') return true
      if (staffUser(req.user)?.role === 'writer') {
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

        // Only a human is credited. A machine caller authenticates as a
        // service account (ADR-0006), whose id would otherwise be written into
        // a `users` relationship and point at an unrelated person.
        const author = staffUser(req.user)
        if (operation === 'create' && author) {
          data.createdBy = author.id
        }

        const dataVariants = (data.variants as Record<string, unknown> | undefined) ?? undefined
        const originalVariants =
          (originalDoc?.variants as Record<string, unknown> | undefined) ?? undefined

        const variantCount = MEDIA_VARIANT_KEYS.reduce(
          (count, key) =>
            getVariantValue(dataVariants, originalVariants, key) ? count + 1 : count,
          0,
        )
        const hasThumbnail = Boolean(getVariantValue(dataVariants, originalVariants, 'thumbnail'))

        if (variantCount === 0) {
          data.status = 'empty'
        } else if (hasThumbnail) {
          data.status = 'usable'
        } else {
          data.status = 'partial'
        }

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
      name: 'source',
      type: 'relationship',
      relationTo: 'media-assets',
      admin: {
        description:
          'Uncropped original image. The pipeline regenerates variants from this source whenever the focal point changes or a new variant spec is added.',
      },
    },
    {
      name: 'focal_point',
      type: 'group',
      admin: {
        description:
          'Normalized (x, y) on the source image (0-1). The pipeline biases all generated crops toward this point.',
      },
      fields: [
        {
          name: 'x',
          type: 'number',
          required: true,
          defaultValue: 0.5,
          min: 0,
          max: 1,
        },
        {
          name: 'y',
          type: 'number',
          required: true,
          defaultValue: 0.5,
          min: 0,
          max: 1,
        },
      ],
    },
    {
      name: 'focal_point_picker',
      type: 'ui',
      admin: {
        components: {
          Field: 'src/features/media/components/FocalPointPickerField.tsx#default',
        },
      },
    },
    {
      name: 'placement_readiness',
      type: 'ui',
      label: 'Placement readiness',
      admin: {
        components: {
          Cell: 'src/features/media/components/PlacementReadinessCell.tsx#default',
        },
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
        { label: 'Empty', value: 'empty' },
        { label: 'Partial', value: 'partial' },
        { label: 'Usable', value: 'usable' },
        { label: 'Complete (legacy)', value: 'complete' },
      ],
      defaultValue: 'empty',
      admin: {
        readOnly: true,
        position: 'sidebar',
        description:
          'Admin-only coarse state. Do not use to gate public rendering — public readiness is determined per placement.',
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

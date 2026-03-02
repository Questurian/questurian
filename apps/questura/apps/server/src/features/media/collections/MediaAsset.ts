/**
 * MediaAsset Collection - Bunny.net Integration
 * Uses @seshuk/payload-storage-bunny plugin for CDN storage
 */

import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionConfig,
  Payload,
  PayloadRequest,
} from 'payload'
import { createLocationRefField } from '@/shared/location/server/fields'
import { syncLocationFields } from '@/shared/location/server/syncLocationFields'
import {
  MEDIA_VARIANT_KEYS,
  MEDIA_VARIANT_OPTIONS,
  type MediaVariantKey,
} from '@/features/media/constants'

const OG_IMAGE_WIDTH = 1200
const OG_IMAGE_HEIGHT = 630
const BUNNY_ORIGINAL_URL_SYNC_CONTEXT_KEY = 'skipBunnyOriginalUrlSync'

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

const normalizeHostname = (hostname: string): string =>
  hostname.replace(/^https?:\/\//, '').replace(/\/+$/, '')

const normalizePathPart = (value: string): string =>
  value.replace(/^\/+/, '').replace(/\/+$/, '')

const buildBunnyStorageUrl = (
  hostname: string,
  prefix: string | null | undefined,
  filename: string
): string | null => {
  const normalizedHost = normalizeHostname(hostname)
  if (!normalizedHost) return null

  const pathParts = [
    ...(prefix ? [normalizePathPart(prefix)] : []),
    normalizePathPart(filename),
  ].filter(Boolean)

  if (pathParts.length === 0) return null

  const encodedPath = encodeURI(pathParts.join('/'))
  return `https://${normalizedHost}/${encodedPath}`
}

const getExpectedBunnyOriginalUrl = (doc: Record<string, unknown>): string | null => {
  const width = toNumber(doc.width)
  const height = toNumber(doc.height)
  const filename = typeof doc.filename === 'string' ? doc.filename : null
  const prefix = typeof doc.prefix === 'string' ? doc.prefix : null
  const hostname = process.env.BUNNY_STORAGE_HOSTNAME

  if (width !== OG_IMAGE_WIDTH || height !== OG_IMAGE_HEIGHT) return null
  if (!filename || !hostname) return null

  return buildBunnyStorageUrl(hostname, prefix, filename)
}

const extractRelationshipId = (value: unknown): string | number | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number') return value
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const idValue = (value as { id?: unknown }).id
    if (typeof idValue === 'string' || typeof idValue === 'number') {
      return idValue
    }
  }
  return null
}

const isVariantKey = (value: unknown): value is MediaVariantKey =>
  MEDIA_VARIANT_KEYS.includes(value as MediaVariantKey)

const updateMediaSetVariant = async (
  payload: Payload,
  req: PayloadRequest,
  mediaSetId: string | number,
  variant: MediaVariantKey,
  assetId: string | number
) => {
  const mediaSet = await payload.findByID({
    collection: 'media-sets',
    id: mediaSetId,
    depth: 0,
    overrideAccess: true,
    req,
  })

  const currentVariants = (mediaSet as { variants?: Record<string, unknown> }).variants ?? {}
  const currentValue = extractRelationshipId(currentVariants[variant])

  if (currentValue && String(currentValue) === String(assetId)) return

  const nextVariants = {
    ...currentVariants,
    [variant]: assetId,
  }

  await payload.update({
    collection: 'media-sets',
    id: mediaSetId,
    data: {
      variants: nextVariants,
    },
    disableTransaction: true,
    overrideAccess: true,
    req,
  })
}

const clearMediaSetVariant = async (
  payload: Payload,
  req: PayloadRequest,
  mediaSetId: string | number,
  variant: MediaVariantKey,
  assetId: string | number | undefined
) => {
  const mediaSet = await payload.findByID({
    collection: 'media-sets',
    id: mediaSetId,
    depth: 0,
    overrideAccess: true,
    req,
  })

  const currentVariants = (mediaSet as { variants?: Record<string, unknown> }).variants ?? {}
  const currentValue = extractRelationshipId(currentVariants[variant])

  if (!currentValue) return
  if (assetId !== undefined && String(currentValue) !== String(assetId)) return

  const nextVariants = {
    ...currentVariants,
    [variant]: null,
  }

  await payload.update({
    collection: 'media-sets',
    id: mediaSetId,
    data: {
      variants: nextVariants,
    },
    disableTransaction: true,
    overrideAccess: true,
    req,
  })
}

const ensureMediaSetVariant: CollectionBeforeChangeHook = async ({
  data,
  req,
  originalDoc,
}) => {
  if (!data) return data

  const mutableData = data as Record<string, unknown>
  const original = originalDoc as Record<string, unknown> | undefined
  const hasMediaSet = Object.prototype.hasOwnProperty.call(mutableData, 'mediaSet')
  const hasVariant = Object.prototype.hasOwnProperty.call(mutableData, 'variant')

  if (
    hasMediaSet &&
    (mutableData['mediaSet'] === null || mutableData['mediaSet'] === undefined) &&
    !hasVariant
  ) {
    mutableData['variant'] = null
  }

  if (
    hasVariant &&
    (mutableData['variant'] === null || mutableData['variant'] === undefined) &&
    !hasMediaSet
  ) {
    mutableData['mediaSet'] = null
  }

  const mediaSetValue = hasMediaSet ? mutableData['mediaSet'] : original?.mediaSet
  const variantValue = hasVariant ? mutableData['variant'] : original?.variant
  const mediaSetId = extractRelationshipId(mediaSetValue)
  const variant = typeof variantValue === 'string' ? variantValue : null

  if (mediaSetId && !variant) {
    throw new Error('variant is required when mediaSet is set')
  }

  if (variant && !mediaSetId) {
    throw new Error('mediaSet is required when variant is set')
  }

  if (!mediaSetId || !variant) return data

  if (!isVariantKey(variant)) {
    throw new Error(`variant must be one of: ${MEDIA_VARIANT_KEYS.join(', ')}`)
  }

  const existing = await req.payload.find({
    collection: 'media-assets',
    where: {
      mediaSet: {
        equals: mediaSetId,
      },
      variant: {
        equals: variant,
      },
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  const existingDoc = existing.docs?.[0] as { id?: string | number } | undefined
  const currentId = original?.id as string | number | undefined

  if (existingDoc?.id && String(existingDoc.id) !== String(currentId)) {
    throw new Error(`mediaSet already has a ${variant} variant`)
  }

  return data
}

const syncMediaSetVariant: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
  const assetId = doc?.id as string | number | undefined
  const currentMediaSetId = extractRelationshipId(doc?.mediaSet)
  const currentVariant = isVariantKey(doc?.variant) ? doc.variant : null
  const previousMediaSetId = extractRelationshipId(previousDoc?.mediaSet)
  const previousVariant = isVariantKey(previousDoc?.variant) ? previousDoc.variant : null

  if (
    previousMediaSetId &&
    previousVariant &&
    (previousMediaSetId !== currentMediaSetId || previousVariant !== currentVariant)
  ) {
    await clearMediaSetVariant(req.payload, req, previousMediaSetId, previousVariant, assetId)
  }

  if (currentMediaSetId && currentVariant && assetId !== undefined) {
    await updateMediaSetVariant(req.payload, req, currentMediaSetId, currentVariant, assetId)
  }
}

const syncBunnyOriginalUrl: CollectionAfterChangeHook = async ({ doc, req }) => {
  const context = (req.context as Record<string, unknown> | undefined) ?? {}
  if (context[BUNNY_ORIGINAL_URL_SYNC_CONTEXT_KEY] === true) return

  const docRecord = (doc as Record<string, unknown> | undefined) ?? {}
  const assetId = docRecord.id as string | number | undefined
  if (assetId === undefined) return

  const expectedUrl = getExpectedBunnyOriginalUrl(docRecord)
  const currentUrl = typeof docRecord.bunny_original_url === 'string'
    ? docRecord.bunny_original_url
    : null

  if (currentUrl === expectedUrl) return

  await req.payload.update({
    collection: 'media-assets',
    id: assetId,
    data: {
      bunny_original_url: expectedUrl,
    },
    disableTransaction: true,
    overrideAccess: true,
    req,
    context: {
      ...context,
      [BUNNY_ORIGINAL_URL_SYNC_CONTEXT_KEY]: true,
    },
  })
}

export const MediaAsset: CollectionConfig = {
  slug: 'media-assets',

  // Disable local storage - use Bunny.net via plugin
  upload: {
    disableLocalStorage: true,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },

  // Access control
  access: {
    read: ({ req }) => {
      // Public access required for website to display images
      if (!req.user) return true
      
      // Admins, Editors, and Writers can see everything
      if (
        req.user.role === 'admin' ||
        req.user.role === 'editor' ||
        req.user.role === 'writer'
      )
        return true

      return false
    },
    create: ({ req }) => {
      // Editors, admins, and writers can upload
      return (
        req.user?.role === 'editor' ||
        req.user?.role === 'admin' ||
        req.user?.role === 'writer'
      )
    },
    update: ({ req }) => {
      const user = req.user
      if (!user) return false

      // Admins and editors can update all
      if (user.role === 'admin' || user.role === 'editor') return true

      // Writers can only update their own uploads
      if (user.role === 'writer') {
        return {
          uploadedBy: {
            equals: user.id,
          },
        }
      }

      return false
    },
    delete: ({ req }) => {
      const user = req.user
      if (!user) return false

      // Admins and editors can delete all
      if (user.role === 'admin' || user.role === 'editor') return true

      // Writers can only delete their own uploads
      if (user.role === 'writer') {
        return {
          uploadedBy: {
            equals: user.id,
          },
        }
      }

      return false
    },
  },

  hooks: {
    beforeValidate: [syncLocationFields()],
    beforeChange: [
      ensureMediaSetVariant,
      ({ req, operation, data }) => {
        // Set uploadedBy on creation
        if (operation === 'create' && req.user) {
          data.uploadedBy = req.user.id
          // Also set user field if not provided, for consistency
          if (!data.user) {
            data.user = req.user.id
          }
        }
        return data
      },
    ],
    afterChange: [syncMediaSetVariant, syncBunnyOriginalUrl],
  },

  // Admin UI customization
  admin: {
    useAsTitle: 'filename',
    defaultColumns: [
      'filename',
      'mediaSet',
      'variant',
      'location',
      'alt_text',
      'width',
      'height',
      'user',
    ],
    group: 'Media',
    hidden: ({ user }) => {
      // Hide from regular users - only show to editors and admins
      return user?.role === 'user' || !user
    },
  },

  // Collection fields
  fields: [
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
        description: 'Link this asset to a media set (optional)',
      },
    },
    {
      name: 'variant',
      type: 'select',
      options: MEDIA_VARIANT_OPTIONS,
      required: false,
      admin: {
        position: 'sidebar',
        description: 'Choose the variant type when linked to a media set',
      },
    },

    // Alt text for accessibility and SEO
    {
      name: 'alt_text',
      type: 'text',
      required: false,
      admin: {
        description: 'Describe the image for accessibility and SEO (e.g., "Sunset over Miraflores beach in Lima")',
        placeholder: 'Descriptive text for screen readers and search engines',
      },
    },

    // Photographer attribution
    {
      name: 'photographer_credit',
      type: 'text',
      required: false,
      admin: {
        description: 'Optional attribution (e.g., "Photo by John Smith" or "Unsplash/username")',
        placeholder: 'Photographer name or source',
      },
    },

    // Location picker (requires hidden field below)
    {
      name: 'location',
      type: 'text',
      required: false,
      admin: {
        position: 'sidebar',
        description: 'Select the location featured in this image (optional)',
        components: {
          Field: 'src/shared/location/LocationPickerField.tsx'
        }
      }
    },
    createLocationRefField(),

    // Hidden field required by LocationPickerField component
    {
      name: 'location_finalized',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        hidden: true
      }
    },

    // Tags relationship
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
        disableListFilter: true, // Disabled to prevent SQL error with hasMany relationships
      }
    },
  ],
}

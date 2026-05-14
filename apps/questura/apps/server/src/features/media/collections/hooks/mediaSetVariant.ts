import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  Payload,
  PayloadRequest,
} from 'payload'
import { MEDIA_VARIANT_KEYS, type MediaVariantKey } from '@/features/media/constants'

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
  assetId: string | number,
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
  assetId: string | number | undefined,
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

export const ensureMediaSetVariant: CollectionBeforeChangeHook = async ({
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

export const syncMediaSetVariant: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
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

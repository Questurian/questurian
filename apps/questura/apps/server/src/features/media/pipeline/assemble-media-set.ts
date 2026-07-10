import type { Payload, PayloadRequest } from 'payload'

import { BUNNY_ORIGINAL_URL_SYNC_CONTEXT_KEY } from '@/features/media/collections/hooks/syncBunnyOriginalUrl'
import { MEDIA_VARIANT_KEYS, type MediaVariantKey } from '@/features/media/constants'
import {
  generateVariantsFromSource,
  normalizeFocalPoint,
  type FocalPoint,
  type VariantOverride,
} from './from-source'

const SOURCE_MIME = 'image/webp'
const SOURCE_EXTENSION = 'webp'

export type AssembleMediaSetInput = {
  payload: Payload
  req?: PayloadRequest
  source: { buffer: Buffer; mimetype: string; filename: string }
  focalPoint?: Partial<FocalPoint> | null
  overrides?: Partial<Record<MediaVariantKey, VariantOverride>>
  metadata: {
    title: string
    alt_text?: string | null
    photographer_credit?: string | null
    location?: string | null
    locationRef?: number | null
    externalRef?: string | null
    tags?: number[] | null
  }
}

export type AssembleMediaSetResult = {
  mediaSetId: number
  sourceAssetId: number
  variantAssetIds: Partial<Record<MediaVariantKey, number>>
}

const SKIP_BUNNY_ORIGINAL_URL_SYNC_CONTEXT = {
  [BUNNY_ORIGINAL_URL_SYNC_CONTEXT_KEY]: true,
}

const toNumericId = (raw: unknown): number => {
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string') {
    const parsed = Number.parseInt(raw, 10)
    if (Number.isFinite(parsed)) return parsed
  }
  throw new Error('Expected numeric id from Payload create response')
}

const sanitizeStem = (filename: string): string => {
  const base = filename.replace(/\.[^/.]+$/, '').toLowerCase()
  const cleaned = base.replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '')
  return cleaned || 'image'
}

export const assembleMediaSetFromSource = async ({
  payload,
  req,
  source,
  focalPoint,
  overrides,
  metadata,
}: AssembleMediaSetInput): Promise<AssembleMediaSetResult> => {
  const focal = normalizeFocalPoint(focalPoint)
  const stem = sanitizeStem(source.filename)

  const variants = await generateVariantsFromSource({
    sourceBuffer: source.buffer,
    focalPoint: focal,
    overrides,
  })

  const sourceAsset = await payload.create({
    collection: 'media-assets',
    file: {
      data: source.buffer,
      mimetype: source.mimetype,
      name: source.filename,
      size: source.buffer.length,
    },
    data: {
      ...(metadata.alt_text ? { alt_text: metadata.alt_text } : {}),
      ...(metadata.photographer_credit
        ? { photographer_credit: metadata.photographer_credit }
        : {}),
      ...(metadata.location ? { location: metadata.location } : {}),
      ...(metadata.locationRef !== null && metadata.locationRef !== undefined
        ? { locationRef: metadata.locationRef }
        : {}),
    },
    overrideAccess: true,
    req,
    context: SKIP_BUNNY_ORIGINAL_URL_SYNC_CONTEXT,
  })

  const sourceAssetId = toNumericId((sourceAsset as { id: unknown }).id)

  const mediaSet = await payload.create({
    collection: 'media-sets',
    data: {
      title: metadata.title,
      ...(metadata.alt_text ? { alt_text: metadata.alt_text } : {}),
      ...(metadata.photographer_credit
        ? { photographer_credit: metadata.photographer_credit }
        : {}),
      ...(metadata.location ? { location: metadata.location } : {}),
      ...(metadata.locationRef !== null && metadata.locationRef !== undefined
        ? { locationRef: metadata.locationRef }
        : {}),
      ...(metadata.externalRef ? { externalRef: metadata.externalRef } : {}),
      ...(metadata.tags ? { tags: metadata.tags } : {}),
      source: sourceAssetId,
      focal_point: focal,
    },
    overrideAccess: true,
    req,
  })

  const mediaSetId = toNumericId((mediaSet as { id: unknown }).id)

  const variantAssetIds: Partial<Record<MediaVariantKey, number>> = {}

  for (const generated of variants) {
    const variantFilename = `${stem}_${generated.variant}.${SOURCE_EXTENSION}`

    const variantAsset = await payload.create({
      collection: 'media-assets',
      file: {
        data: generated.buffer,
        mimetype: SOURCE_MIME,
        name: variantFilename,
        size: generated.buffer.length,
      },
      data: {
        mediaSet: mediaSetId,
        variant: generated.variant,
        ...(metadata.alt_text ? { alt_text: metadata.alt_text } : {}),
        ...(metadata.photographer_credit
          ? { photographer_credit: metadata.photographer_credit }
          : {}),
        ...(metadata.location ? { location: metadata.location } : {}),
        ...(metadata.locationRef !== null && metadata.locationRef !== undefined
          ? { locationRef: metadata.locationRef }
          : {}),
      },
      overrideAccess: true,
      req,
      context: SKIP_BUNNY_ORIGINAL_URL_SYNC_CONTEXT,
    })

    variantAssetIds[generated.variant] = toNumericId((variantAsset as { id: unknown }).id)
  }

  // Sanity: ensure every required variant key produced an asset id
  for (const key of MEDIA_VARIANT_KEYS) {
    if (!variantAssetIds[key]) {
      throw new Error(`from-source pipeline failed to produce variant ${key}`)
    }
  }

  return { mediaSetId, sourceAssetId, variantAssetIds }
}

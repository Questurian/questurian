import type { Payload, PayloadRequest } from 'payload'

import { MEDIA_VARIANT_KEYS, type MediaVariantKey } from '@/features/media/constants'
import { generateVariantsFromSource, normalizeFocalPoint } from './from-source'

export type RegenerateInput = {
  payload: Payload
  req?: PayloadRequest
  mediaSetId: number
}

export type RegenerateResult = {
  mediaSetId: number
  variantAssetIds: Partial<Record<MediaVariantKey, number>>
}

const SOURCE_MIME = 'image/webp'

const toNumericId = (raw: unknown): number => {
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string') {
    const parsed = Number.parseInt(raw, 10)
    if (Number.isFinite(parsed)) return parsed
  }
  throw new Error('Expected numeric id from Payload response')
}

const sanitizeStem = (filename: string): string => {
  const base = filename.replace(/\.[^/.]+$/, '').toLowerCase()
  const cleaned = base.replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '')
  return cleaned || 'image'
}

const fetchSourceBuffer = async (sourceUrl: string): Promise<Buffer> => {
  const response = await fetch(sourceUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch source image (${response.status})`)
  }
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

/**
 * Re-runs the variant pipeline for an existing MediaSet using its `source`
 * and `focal_point`. Existing variant MediaAssets are detached and deleted;
 * fresh variants are uploaded and reattached.
 */
export const regenerateVariantsForMediaSet = async ({
  payload,
  req,
  mediaSetId,
}: RegenerateInput): Promise<RegenerateResult> => {
  const mediaSet = (await payload.findByID({
    collection: 'media-sets',
    id: mediaSetId,
    depth: 1,
    overrideAccess: true,
    req,
  })) as unknown as Record<string, unknown>

  const source = mediaSet.source
  if (!source || typeof source !== 'object') {
    throw new Error('MediaSet has no source asset; cannot regenerate variants')
  }

  const sourceRecord = source as { id?: unknown; url?: unknown; filename?: unknown }
  const sourceUrl = typeof sourceRecord.url === 'string' ? sourceRecord.url : null
  if (!sourceUrl) {
    throw new Error('Source asset has no URL; cannot fetch image bytes')
  }
  const sourceFilename =
    typeof sourceRecord.filename === 'string' ? sourceRecord.filename : 'source-upload'

  const focalRaw = mediaSet.focal_point as { x?: unknown; y?: unknown } | undefined
  const focal = normalizeFocalPoint({
    x: typeof focalRaw?.x === 'number' ? focalRaw.x : undefined,
    y: typeof focalRaw?.y === 'number' ? focalRaw.y : undefined,
  })

  const sourceBuffer = await fetchSourceBuffer(sourceUrl)

  const newVariants = await generateVariantsFromSource({
    sourceBuffer,
    focalPoint: focal,
  })

  const previousVariants = (mediaSet.variants as Record<string, unknown> | undefined) ?? {}
  const previousVariantAssetIds = MEDIA_VARIANT_KEYS.map((key) => {
    const raw = previousVariants[key]
    if (typeof raw === 'number') return raw
    if (raw && typeof raw === 'object' && 'id' in raw) {
      const id = (raw as { id?: unknown }).id
      if (typeof id === 'number') return id
    }
    return null
  }).filter((id): id is number => id !== null)

  const stem = sanitizeStem(sourceFilename)
  const altText = typeof mediaSet.alt_text === 'string' ? mediaSet.alt_text : null
  const photographerCredit =
    typeof mediaSet.photographer_credit === 'string' ? mediaSet.photographer_credit : null
  const location = typeof mediaSet.location === 'string' ? mediaSet.location : null
  const locationRefRaw = mediaSet.locationRef
  const locationRef =
    typeof locationRefRaw === 'number'
      ? locationRefRaw
      : locationRefRaw && typeof locationRefRaw === 'object' && 'id' in locationRefRaw
        ? typeof (locationRefRaw as { id?: unknown }).id === 'number'
          ? ((locationRefRaw as { id: number }).id)
          : null
        : null

  const variantAssetIds: Partial<Record<MediaVariantKey, number>> = {}

  for (const generated of newVariants) {
    const variantFilename = `${stem}_${generated.variant}.webp`
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
        ...(altText ? { alt_text: altText } : {}),
        ...(photographerCredit ? { photographer_credit: photographerCredit } : {}),
        ...(location ? { location } : {}),
        ...(locationRef !== null ? { locationRef } : {}),
      },
      overrideAccess: true,
      req,
    })

    variantAssetIds[generated.variant] = toNumericId((variantAsset as { id: unknown }).id)
  }

  for (const id of previousVariantAssetIds) {
    if (Object.values(variantAssetIds).includes(id)) continue
    try {
      await payload.delete({
        collection: 'media-assets',
        id,
        overrideAccess: true,
        req,
      })
    } catch (error) {
      console.warn(`[regenerate] failed to delete previous variant asset ${id}`, error)
    }
  }

  return { mediaSetId, variantAssetIds }
}

import sharp from 'sharp'

import { MEDIA_VARIANT_KEYS, type MediaVariantKey } from '@/features/media/constants'
import { VARIANT_SPECS, WEBP_QUALITY, type VariantSpec } from './variant-specs'

export type FocalPoint = { x: number; y: number }

export type VariantOverride = {
  /** Crop rectangle in source-image pixels. Overrides focal-point computation when present. */
  left: number
  top: number
  width: number
  height: number
}

export type GeneratedVariant = {
  variant: MediaVariantKey
  buffer: Buffer
  width: number
  height: number
  format: 'webp'
}

const DEFAULT_FOCAL_POINT: FocalPoint = { x: 0.5, y: 0.5 }

const clampFocalCoord = (value: number): number => {
  if (!Number.isFinite(value)) return 0.5
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

export const normalizeFocalPoint = (
  focalPoint: Partial<FocalPoint> | null | undefined,
): FocalPoint => {
  if (!focalPoint) return DEFAULT_FOCAL_POINT
  return {
    x: clampFocalCoord(focalPoint.x ?? DEFAULT_FOCAL_POINT.x),
    y: clampFocalCoord(focalPoint.y ?? DEFAULT_FOCAL_POINT.y),
  }
}

/**
 * Compute the largest crop rectangle in source-image pixels that:
 *  - matches the variant's target aspect ratio
 *  - is centered as close to the focal point as possible without leaving the image
 */
export const computeFocalCrop = (
  sourceWidth: number,
  sourceHeight: number,
  spec: VariantSpec,
  focalPoint: FocalPoint,
): { left: number; top: number; width: number; height: number } => {
  const sourceRatio = sourceWidth / sourceHeight
  let cropWidth: number
  let cropHeight: number

  if (sourceRatio > spec.ratio) {
    cropHeight = sourceHeight
    cropWidth = Math.round(cropHeight * spec.ratio)
  } else {
    cropWidth = sourceWidth
    cropHeight = Math.round(cropWidth / spec.ratio)
  }

  const focalPxX = focalPoint.x * sourceWidth
  const focalPxY = focalPoint.y * sourceHeight

  let left = Math.round(focalPxX - cropWidth / 2)
  let top = Math.round(focalPxY - cropHeight / 2)

  left = Math.max(0, Math.min(left, sourceWidth - cropWidth))
  top = Math.max(0, Math.min(top, sourceHeight - cropHeight))

  return { left, top, width: cropWidth, height: cropHeight }
}

export type GenerateVariantsInput = {
  sourceBuffer: Buffer
  focalPoint?: Partial<FocalPoint> | null
  /** Per-variant pixel-rect override. Falls back to focal-point crop when absent. */
  overrides?: Partial<Record<MediaVariantKey, VariantOverride>>
}

export const generateVariantsFromSource = async ({
  sourceBuffer,
  focalPoint,
  overrides,
}: GenerateVariantsInput): Promise<GeneratedVariant[]> => {
  const focal = normalizeFocalPoint(focalPoint)
  const sourceMeta = await sharp(sourceBuffer).metadata()
  const sourceWidth = sourceMeta.width
  const sourceHeight = sourceMeta.height

  if (!sourceWidth || !sourceHeight) {
    throw new Error('Source image has no readable dimensions')
  }

  const generated: GeneratedVariant[] = []

  for (const variant of MEDIA_VARIANT_KEYS) {
    const spec = VARIANT_SPECS[variant]
    const override = overrides?.[variant]
    const crop = override
      ? {
          left: Math.max(0, Math.min(override.left, sourceWidth - 1)),
          top: Math.max(0, Math.min(override.top, sourceHeight - 1)),
          width: Math.min(override.width, sourceWidth),
          height: Math.min(override.height, sourceHeight),
        }
      : computeFocalCrop(sourceWidth, sourceHeight, spec, focal)

    const buffer = await sharp(sourceBuffer)
      .extract({
        left: crop.left,
        top: crop.top,
        width: crop.width,
        height: crop.height,
      })
      .resize(spec.width, spec.height, { fit: 'fill' })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer()

    generated.push({
      variant,
      buffer,
      width: spec.width,
      height: spec.height,
      format: 'webp',
    })
  }

  return generated
}

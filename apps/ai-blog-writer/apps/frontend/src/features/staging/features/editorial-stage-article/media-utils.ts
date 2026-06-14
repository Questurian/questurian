import type { UploadImageResponse } from '../../../../shared/images'
import type { MediaAsset } from '../../api'
import {
  CONTENT_BLOCK_HEIGHT,
  CONTENT_BLOCK_WIDTH,
  FEATURED_IMAGE_HEIGHT,
  FEATURED_IMAGE_WIDTH,
  IMG_BLOCK_MIN_HEIGHT,
  IMG_BLOCK_MIN_WIDTH,
  IMG_TRIO_DIMENSIONS,
  VARIANT_FALLBACK_ORDER,
} from './constants'
import type { ImgTrioFormat, MediaVariant } from './types'

// External-image helpers moved to shared/images/external (ADR 0020). Re-exported
// here so existing staging imports keep working until the staging migration.
export {
  buildImageFileNamePrefix,
  getUnsplashPhotoImportUrl,
  getPexelsPhotoImportUrl,
  buildExternalAltText,
  buildExternalPhotographerCredit,
  buildExternalImportRef,
} from '../../../../shared/images/external/external-import.utils'

export function buildFeaturedUploadExternalRef(stagedArticleId: string): string {
  const articleToken = stagedArticleId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'staged-article'

  return `${articleToken}_featured_upload_${Date.now()}`
}

export function getMediaAssetAltText(img?: MediaAsset | null): string {
  if (!img) return ''
  return img.alt_text?.trim() || img.alt?.trim() || img.altText?.trim() || ''
}

export function hasExactDimensions(
  img: MediaAsset | null | undefined,
  width: number,
  height: number
): boolean {
  if (!img) return false
  return img.width === width && img.height === height
}

export function hasExactImgBlockDimensions(img?: MediaAsset | null): boolean {
  return hasExactDimensions(img, IMG_BLOCK_MIN_WIDTH, IMG_BLOCK_MIN_HEIGHT)
}

export function hasExactContentBlockDimensions(img?: MediaAsset | null): boolean {
  return hasExactDimensions(img, CONTENT_BLOCK_WIDTH, CONTENT_BLOCK_HEIGHT)
}

export function hasExactFeaturedImageDimensions(img?: MediaAsset | null): boolean {
  return hasExactDimensions(img, FEATURED_IMAGE_WIDTH, FEATURED_IMAGE_HEIGHT)
}

export function getImgTrioDimensions(format: ImgTrioFormat): { width: number; height: number } {
  return IMG_TRIO_DIMENSIONS[format]
}

export function hasExactImgTrioDimensions(
  img: MediaAsset | null | undefined,
  format: ImgTrioFormat
): boolean {
  const dims = getImgTrioDimensions(format)
  return hasExactDimensions(img, dims.width, dims.height)
}

export function getRelationshipId(
  value: MediaAsset['mediaSet']
): string | number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number') return value
  if (typeof value === 'object' && 'id' in value) {
    const id = value.id
    if (typeof id === 'string' || typeof id === 'number') return id
  }
  return null
}

export function pickVariantAssetId(
  variantAssetIds: UploadImageResponse['variantAssetIds'],
  preferredVariant: MediaVariant
): number | null {
  if (!variantAssetIds) return null

  const orderedVariants: MediaVariant[] = [
    preferredVariant,
    ...VARIANT_FALLBACK_ORDER.filter(variant => variant !== preferredVariant),
  ]

  for (const variant of orderedVariants) {
    const rawId = variantAssetIds[variant]
    if (!rawId) continue
    const numericId = Number(rawId)
    if (!Number.isNaN(numericId)) {
      return numericId
    }
  }

  return null
}

export function mergeMediaAssetLists(
  existingAssets: MediaAsset[],
  nextAssets: MediaAsset[]
): MediaAsset[] {
  if (!nextAssets.length) return existingAssets

  const mergedAssets = new Map<number, MediaAsset>()
  existingAssets.forEach((asset) => mergedAssets.set(asset.id, asset))
  nextAssets.forEach((asset) => mergedAssets.set(asset.id, asset))

  return Array.from(mergedAssets.values())
}

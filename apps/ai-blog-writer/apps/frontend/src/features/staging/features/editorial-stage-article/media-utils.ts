import type { UploadImageResponse } from '../../../images'
import type {
  ExternalImageProvider,
  MediaAsset,
  PexelsPhoto,
  UnsplashPhoto,
} from '../../api'
import {
  CONTENT_BLOCK_HEIGHT,
  CONTENT_BLOCK_WIDTH,
  EXTERNAL_PROVIDER_LABEL,
  FEATURED_IMAGE_HEIGHT,
  FEATURED_IMAGE_WIDTH,
  IMG_BLOCK_MIN_HEIGHT,
  IMG_BLOCK_MIN_WIDTH,
  IMG_TRIO_DIMENSIONS,
  VARIANT_FALLBACK_ORDER,
} from './constants'
import type { ImgTrioFormat, MediaVariant } from './types'

export function buildImageFileNamePrefix(articleTitle: string, externalRef: string): string {
  const slugify = (value: string): string => {
    const normalized = value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')

    return normalized
  }

  const stableHash = (value: string): string => {
    let hash = 2166136261
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index)
      hash +=
        (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
    }
    return (hash >>> 0).toString(36).slice(0, 4)
  }

  const titleSlug = slugify(articleTitle)
  const titlePart = (titleSlug.split('-')[0] || 'image').slice(0, 16)
  const numericToken = (externalRef.match(/\d+/g)?.[0] || '').slice(-6)
  const hashToken = stableHash(externalRef)
  const idPart = numericToken
    ? `${numericToken}${hashToken}`
    : hashToken

  return `${titlePart}-${idPart}`
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

export function getUnsplashPhotoImportUrl(photo: UnsplashPhoto): string {
  return photo.image_url_raw || photo.image_url_full || photo.image_url_regular || photo.image_url
}

export function getPexelsPhotoImportUrl(photo: PexelsPhoto): string {
  return photo.image_url_original || photo.image_url_large || photo.image_url_portrait || photo.image_url
}

export function buildExternalAltText(rawAlt: string | undefined, articleTitle: string): string {
  const normalizedAlt = (rawAlt || '').trim()
  if (normalizedAlt) return normalizedAlt
  const normalizedTitle = articleTitle.trim()
  return normalizedTitle ? `${normalizedTitle} image` : 'Article image'
}

export function buildExternalPhotographerCredit(
  photographer: string | undefined,
  provider: ExternalImageProvider
): string {
  const normalizedPhotographer = (photographer || '').trim()
  const providerLabel = EXTERNAL_PROVIDER_LABEL[provider]
  return normalizedPhotographer
    ? `${normalizedPhotographer} / ${providerLabel}`
    : providerLabel
}

export function buildExternalImportRef(
  baseRef: string,
  provider: ExternalImageProvider,
  photoId?: string | number
): string {
  const token = String(photoId ?? 'image')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'image'
  return `${baseRef}_${provider}_${token}_${Date.now()}`
}

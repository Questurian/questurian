import type { ExternalImageProvider, PexelsPhoto, UnsplashPhoto } from './external-images.types'

const EXTERNAL_PROVIDER_LABEL: Record<ExternalImageProvider, string> = {
  unsplash: 'Unsplash',
  pexels: 'Pexels',
}

/**
 * Deterministic, short filename prefix for an uploaded image, derived from a
 * title and the external ref. Stable across runs for the same ref.
 */
export function buildImageFileNamePrefix(articleTitle: string, externalRef: string): string {
  const slugify = (value: string): string =>
    value
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')

  const stableHash = (value: string): string => {
    let hash = 2166136261
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index)
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
    }
    return (hash >>> 0).toString(36).slice(0, 4)
  }

  const titleSlug = slugify(articleTitle)
  const titlePart = (titleSlug.split('-')[0] || 'image').slice(0, 16)
  const numericToken = (externalRef.match(/\d+/g)?.[0] || '').slice(-6)
  const hashToken = stableHash(externalRef)
  const idPart = numericToken ? `${numericToken}${hashToken}` : hashToken

  return `${titlePart}-${idPart}`
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
  provider: ExternalImageProvider,
): string {
  const normalizedPhotographer = (photographer || '').trim()
  const providerLabel = EXTERNAL_PROVIDER_LABEL[provider]
  return normalizedPhotographer ? `${normalizedPhotographer} / ${providerLabel}` : providerLabel
}

export function buildExternalImportRef(
  baseRef: string,
  provider: ExternalImageProvider,
  photoId?: string | number,
): string {
  const token =
    String(photoId ?? 'image')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'image'
  return `${baseRef}_${provider}_${token}_${Date.now()}`
}

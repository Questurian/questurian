import type { MediaAsset, MediaSet, MediaSetVariantAsset } from '../../shared/api/payload/payload.types'

const PAYLOAD_API_URL = import.meta.env.VITE_PAYLOAD_API_URL || 'http://localhost:4000'
const PREFERRED_MEDIA_SET_VARIANTS = ['thumbnail', 'square', 'editorial', 'wide', 'portrait', 'hero', 'open_graph'] as const

export function getMediaSetId(
  mediaSet: MediaAsset['mediaSet'],
): string | number | null {
  if (mediaSet === null || mediaSet === undefined) return null
  if (typeof mediaSet === 'string' || typeof mediaSet === 'number') {
    return mediaSet
  }
  if (typeof mediaSet === 'object' && 'id' in mediaSet) {
    const mediaSetId = mediaSet.id
    if (typeof mediaSetId === 'string' || typeof mediaSetId === 'number') {
      return mediaSetId
    }
  }
  return null
}

export function hasMediaSet(
  asset: Pick<MediaAsset, 'mediaSet'> | null | undefined,
): boolean {
  return getMediaSetId(asset?.mediaSet) !== null
}

export function filterAssetsWithMediaSet<T extends Pick<MediaAsset, 'mediaSet'>>(
  assets: T[],
): T[] {
  return assets.filter((asset) => hasMediaSet(asset))
}

export function formatMediaSetLabel(option: Pick<MediaSet, 'title' | 'location' | 'alt_text'>): string {
  const parts = [option.title, option.location, option.alt_text]
    .map((v) => (typeof v === 'string' ? v : null))
    .filter((value): value is string => Boolean(value?.trim()))
  return parts.join(' · ') || 'Untitled media set'
}

export function resolveMediaSetPreviewAsset(
  mediaSet: Pick<MediaSet, 'variants'> | null | undefined,
): MediaSetVariantAsset | null {
  if (!mediaSet?.variants) return null

  for (const key of PREFERRED_MEDIA_SET_VARIANTS) {
    const variant = mediaSet.variants[key]
    if (variant && typeof variant === 'object') {
      return variant as MediaSetVariantAsset
    }
  }

  return null
}

export function resolveMediaSetPreviewAssetId(
  mediaSet: Pick<MediaSet, 'variants'> | null | undefined,
): number | null {
  if (!mediaSet?.variants) return null

  for (const key of PREFERRED_MEDIA_SET_VARIANTS) {
    const variant = mediaSet.variants[key]
    if (typeof variant === 'number' && Number.isFinite(variant)) {
      return variant
    }
    if (variant && typeof variant === 'object' && typeof variant.id === 'number') {
      return variant.id
    }
  }

  return null
}

export function resolveMediaSetPreviewUrl(
  mediaSet: Pick<MediaSet, 'variants'> | null | undefined,
): string | undefined {
  const previewAsset = resolveMediaSetPreviewAsset(mediaSet)
  if (!previewAsset) return undefined
  if (previewAsset.url) return previewAsset.url
  if (previewAsset.filename) return `${PAYLOAD_API_URL}/api/media-assets/file/${previewAsset.filename}`
  return undefined
}

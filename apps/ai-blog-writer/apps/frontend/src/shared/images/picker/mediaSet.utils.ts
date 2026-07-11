import type { UploadImageResponse } from '../api/imagesApi'
import type { MediaAsset, MediaSet, MediaSetVariantAsset } from '../../api/payload/payload.types'

const PAYLOAD_API_URL = import.meta.env.VITE_PAYLOAD_API_URL || 'http://localhost:4000'
const PREFERRED_MEDIA_SET_VARIANTS = ['thumbnail', 'square', 'editorial', 'wide', 'portrait', 'hero', 'open_graph'] as const

function withAssetCacheKey(url: string, asset: Pick<MediaSetVariantAsset, 'id' | 'updatedAt'>): string {
  const key = asset.updatedAt || asset.id
  if (!key) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}v=${encodeURIComponent(String(key))}`
}

export function getMediaSetId(mediaSet: MediaAsset['mediaSet']): string | number | null {
  if (mediaSet === null || mediaSet === undefined) return null
  if (typeof mediaSet === 'string' || typeof mediaSet === 'number') return mediaSet
  if (typeof mediaSet === 'object' && 'id' in mediaSet) {
    const id = mediaSet.id
    if (typeof id === 'string' || typeof id === 'number') return id
  }
  return null
}

export function hasMediaSet(asset: Pick<MediaAsset, 'mediaSet'> | null | undefined): boolean {
  return getMediaSetId(asset?.mediaSet) !== null
}

export function filterAssetsWithMediaSet<T extends Pick<MediaAsset, 'mediaSet'>>(assets: T[]): T[] {
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
    if (variant && typeof variant === 'object') return variant as MediaSetVariantAsset
  }
  return null
}

export function resolveMediaSetPreviewAssetId(
  mediaSet: Pick<MediaSet, 'variants'> | null | undefined,
): number | null {
  if (!mediaSet?.variants) return null
  for (const key of PREFERRED_MEDIA_SET_VARIANTS) {
    const variant = mediaSet.variants[key]
    if (typeof variant === 'number' && Number.isFinite(variant)) return variant
    if (variant && typeof variant === 'object' && typeof variant.id === 'number') return variant.id
  }
  return null
}

export function isMediaSetSelected(
  mediaSet: Pick<MediaSet, 'id' | 'variants'> | null | undefined,
  selectedId: number | null,
): boolean {
  if (!mediaSet || selectedId === null) return false
  if (String(mediaSet.id) === String(selectedId)) return true
  return resolveMediaSetPreviewAssetId(mediaSet) === selectedId
}

export function resolveMediaSetPreviewUrl(
  mediaSet: Pick<MediaSet, 'variants'> | null | undefined,
): string | undefined {
  const previewAsset = resolveMediaSetPreviewAsset(mediaSet)
  if (!previewAsset) return undefined
  if (previewAsset.url) return withAssetCacheKey(previewAsset.url, previewAsset)
  if (previewAsset.filename) {
    return withAssetCacheKey(`${PAYLOAD_API_URL}/api/media-assets/file/${previewAsset.filename}`, previewAsset)
  }
  return undefined
}

export function resolveAssetUrl(asset: Pick<MediaAsset, 'url' | 'filename'>): string {
  if (asset.url) return asset.url
  return `${PAYLOAD_API_URL}/api/media-assets/file/${asset.filename}`
}

export function getMediaAssetAltText(asset?: Pick<MediaAsset, 'alt_text' | 'altText' | 'alt' | 'filename'> | null): string {
  if (!asset) return ''
  return asset.alt_text ?? asset.altText ?? asset.alt ?? asset.filename ?? ''
}

/**
 * Resolve the asset id to persist from an upload/import response: prefer the
 * requested variant, fall back to any available variant.
 */
export function pickUploadedAssetId(
  response: UploadImageResponse,
  preferredVariant?: string,
): number | null {
  const ids = response.variantAssetIds as Record<string, unknown> | undefined
  if (!ids) return null
  const keys = [preferredVariant, ...Object.keys(ids)].filter((key): key is string => Boolean(key))
  for (const key of keys) {
    const raw = ids[key]
    if (raw == null) continue
    const numeric = Number(raw)
    if (!Number.isNaN(numeric)) return numeric
  }
  return null
}

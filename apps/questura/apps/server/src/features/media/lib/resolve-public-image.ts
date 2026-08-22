import { MEDIA_VARIANT_KEYS, type MediaVariantKey } from '@/features/media/constants'

export type MediaPlacement =
  | 'card'
  | 'square-card'
  | 'wide-card'
  | 'portrait-card'
  | 'hero'
  | 'article-header'
  | 'open-graph'

export type PublicImageStatus = 'ready' | 'missing' | 'legacy_fallback'

export type PublicImage = {
  url: string | null
  alt: string
  width: number | null
  height: number | null
  variant: MediaVariantKey | null
  status: PublicImageStatus
}

type MediaAssetLike = {
  url?: unknown
  bunny_original_url?: unknown
  alt_text?: unknown
  width?: unknown
  height?: unknown
  variant?: unknown
}

type MediaSetLike = {
  title?: unknown
  alt_text?: unknown
  variants?: unknown
}

type PlacementConfig = {
  required: MediaVariantKey
  migrationFallbacks: MediaVariantKey[]
}

type ResolveOptions = {
  allowMigrationFallback?: boolean
}

const PLACEMENT_CONFIG: Record<MediaPlacement, PlacementConfig> = {
  card: { required: 'thumbnail', migrationFallbacks: [] },
  'square-card': { required: 'square', migrationFallbacks: [] },
  'wide-card': { required: 'wide', migrationFallbacks: ['thumbnail'] },
  'portrait-card': { required: 'portrait', migrationFallbacks: [] },
  hero: { required: 'hero', migrationFallbacks: ['wide'] },
  'article-header': { required: 'wide', migrationFallbacks: ['hero'] },
  'open-graph': { required: 'open_graph', migrationFallbacks: [] },
}

const MISSING_IMAGE: PublicImage = {
  url: null,
  alt: '',
  width: null,
  height: null,
  variant: null,
  status: 'missing',
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isMediaVariantKey = (value: unknown): value is MediaVariantKey =>
  typeof value === 'string' && MEDIA_VARIANT_KEYS.includes(value as MediaVariantKey)

const textOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

const numberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const backendOriginForPublicUrls = (): string | null => {
  const value = process.env.BACKEND_URL_LOCAL || process.env.NEXT_PUBLIC_BACKEND_URL
  if (!value) return null

  try {
    const url = new URL(value)
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' ? null : url.origin
  } catch {
    return null
  }
}

const normalizePublicAssetUrl = (value: string): string => {
  try {
    const url = new URL(value)
    const isLocalBackend =
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.port === '4000'
    const publicBackendOrigin = backendOriginForPublicUrls()

    if (isLocalBackend && publicBackendOrigin) {
      return `${publicBackendOrigin}${url.pathname}${url.search}${url.hash}`
    }
  } catch {
    // Relative paths and malformed historical data should pass through unchanged.
  }

  return value
}

const assetUrl = (asset: MediaAssetLike, status: PublicImageStatus): string | null => {
  const canonicalUrl = textOrNull(asset.url)
  if (canonicalUrl) return normalizePublicAssetUrl(canonicalUrl)
  const fallbackUrl = status === 'legacy_fallback' ? textOrNull(asset.bunny_original_url) : null
  return fallbackUrl ? normalizePublicAssetUrl(fallbackUrl) : null
}

const assetToPublicImage = (
  asset: MediaAssetLike,
  variant: MediaVariantKey | null,
  status: PublicImageStatus,
  mediaSet?: MediaSetLike,
): PublicImage => {
  const url = assetUrl(asset, status)
  if (!url) return MISSING_IMAGE

  return {
    url,
    alt:
      textOrNull(asset.alt_text) ??
      textOrNull(mediaSet?.alt_text) ??
      textOrNull(mediaSet?.title) ??
      '',
    width: numberOrNull(asset.width),
    height: numberOrNull(asset.height),
    variant,
    status,
  }
}

const getVariantAsset = (
  mediaSet: MediaSetLike,
  variant: MediaVariantKey,
): MediaAssetLike | null => {
  const variants = mediaSet.variants
  if (!isRecord(variants)) return null

  const asset = variants[variant]
  return isRecord(asset) ? asset : null
}

export const resolveMediaSetForPlacement = (
  mediaSet: MediaSetLike | null | undefined,
  placement: MediaPlacement,
  options: ResolveOptions = {},
): PublicImage => {
  if (!mediaSet || !isRecord(mediaSet)) return MISSING_IMAGE

  const config = PLACEMENT_CONFIG[placement]
  const requiredAsset = getVariantAsset(mediaSet, config.required)

  if (requiredAsset) {
    const image = assetToPublicImage(requiredAsset, config.required, 'ready', mediaSet)
    if (image.status === 'ready') return image
  }

  if (options.allowMigrationFallback) {
    for (const fallbackVariant of config.migrationFallbacks) {
      const fallbackAsset = getVariantAsset(mediaSet, fallbackVariant)
      if (!fallbackAsset) continue
      const image = assetToPublicImage(fallbackAsset, fallbackVariant, 'legacy_fallback', mediaSet)
      if (image.status === 'legacy_fallback') return image
    }
  }

  return MISSING_IMAGE
}

export const resolveLegacyAssetForPlacement = (
  asset: MediaAssetLike | null | undefined,
  placement: MediaPlacement,
): PublicImage => {
  void placement

  if (!asset || !isRecord(asset)) return MISSING_IMAGE

  const variant = isMediaVariantKey(asset.variant) ? asset.variant : null
  return assetToPublicImage(asset, variant, 'legacy_fallback')
}

export const isMediaSetReadyForPlacement = (
  mediaSet: MediaSetLike | null | undefined,
  placement: MediaPlacement,
): boolean => resolveMediaSetForPlacement(mediaSet, placement).status === 'ready'

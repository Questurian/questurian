import { MEDIA_VARIANT_KEYS, type MediaVariantKey } from '@/features/media/constants'

export type MediaPlacement =
  | 'card'
  | 'square-card'
  | 'wide-card'
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

const assetUrl = (asset: MediaAssetLike, status: PublicImageStatus): string | null => {
  const canonicalUrl = textOrNull(asset.url)
  if (canonicalUrl) return canonicalUrl
  return status === 'legacy_fallback' ? textOrNull(asset.bunny_original_url) : null
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
      const image = assetToPublicImage(
        fallbackAsset,
        fallbackVariant,
        'legacy_fallback',
        mediaSet,
      )
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

import { MEDIA_VARIANT_KEYS, type MediaVariantKey } from '@/features/media/constants'

export type MediaSetStatus = 'empty' | 'partial' | 'usable'

export type MediaMigrationAsset = {
  id?: string | number | null
  url?: string | null
  bunny_original_url?: string | null
  filename?: string | null
  mimeType?: string | null
  width?: number | null
  height?: number | null
  variant?: string | null
  mediaSet?: MediaMigrationSet | string | number | null
  alt_text?: string | null
  photographer_credit?: string | null
  location?: string | null
  locationRef?: unknown
  location_finalized?: boolean | null
  tags?: unknown[] | null
}

export type MediaMigrationSet = {
  id?: string | number | null
  title?: string | null
  variants?: Partial<Record<MediaVariantKey, MediaMigrationAsset | string | number | null>> | null
  alt_text?: string | null
  photographer_credit?: string | null
  location?: string | null
  locationRef?: unknown
  location_finalized?: boolean | null
  tags?: unknown[] | null
}

export type MediaSetCreateData = {
  title: string
  alt_text?: string
  photographer_credit?: string
  location?: string
  locationRef?: unknown
  location_finalized?: boolean
  tags?: unknown[]
}

export type GeneratedVariantSpec = {
  variant: MediaVariantKey
  width: number
  height: number
  fit: 'cover'
  format: 'webp'
}

export type VariantGenerationPlan = {
  required: MediaVariantKey[]
  missing: MediaVariantKey[]
  sourceAsset: MediaMigrationAsset | null
  generated: GeneratedVariantSpec[]
}

const GENERATED_VARIANT_SPECS: Record<MediaVariantKey, GeneratedVariantSpec> = {
  thumbnail: { variant: 'thumbnail', width: 1200, height: 800, fit: 'cover', format: 'webp' },
  square: { variant: 'square', width: 1200, height: 1200, fit: 'cover', format: 'webp' },
  wide: { variant: 'wide', width: 1600, height: 900, fit: 'cover', format: 'webp' },
  portrait: { variant: 'portrait', width: 1200, height: 1500, fit: 'cover', format: 'webp' },
  hero: { variant: 'hero', width: 2100, height: 900, fit: 'cover', format: 'webp' },
  open_graph: { variant: 'open_graph', width: 1200, height: 630, fit: 'cover', format: 'webp' },
  editorial: { variant: 'editorial', width: 1600, height: 1200, fit: 'cover', format: 'webp' },
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const isMediaVariantKey = (value: unknown): value is MediaVariantKey =>
  typeof value === 'string' && MEDIA_VARIANT_KEYS.includes(value as MediaVariantKey)

export const extractRelationshipId = (value: unknown): string | number | null => {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (isRecord(value) && (typeof value.id === 'string' || typeof value.id === 'number')) {
    return value.id
  }
  return null
}

const trimmedText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

const hasVariantAsset = (
  mediaSet: Pick<MediaMigrationSet, 'variants'> | null | undefined,
  variant: MediaVariantKey,
): boolean => Boolean(extractRelationshipId(mediaSet?.variants?.[variant]))

export const getMediaSetStatus = (
  variants: Pick<MediaMigrationSet, 'variants'>['variants'],
): MediaSetStatus => {
  if (!variants || Object.values(variants).every((value) => !extractRelationshipId(value))) {
    return 'empty'
  }
  return extractRelationshipId(variants.thumbnail) ? 'usable' : 'partial'
}

export const pickMediaSetTitle = (asset: MediaMigrationAsset): string => {
  return (
    trimmedText(asset.alt_text) ??
    trimmedText(asset.filename) ??
    `Migrated media set ${new Date().toISOString()}`
  )
}

export const buildMediaSetCreateData = (asset: MediaMigrationAsset): MediaSetCreateData => {
  const data: MediaSetCreateData = {
    title: pickMediaSetTitle(asset),
  }

  const altText = trimmedText(asset.alt_text)
  const photographerCredit = trimmedText(asset.photographer_credit)
  const location = trimmedText(asset.location)

  if (altText) data.alt_text = altText
  if (photographerCredit) data.photographer_credit = photographerCredit
  if (location) data.location = location
  if (asset.locationRef !== undefined && asset.locationRef !== null) {
    data.locationRef = extractRelationshipId(asset.locationRef) ?? asset.locationRef
  }
  if (typeof asset.location_finalized === 'boolean') {
    data.location_finalized = asset.location_finalized
  }
  if (Array.isArray(asset.tags) && asset.tags.length > 0) {
    data.tags = asset.tags
  }

  return data
}

export const pickSourceUrl = (asset: MediaMigrationAsset | null | undefined): string | null =>
  trimmedText(asset?.url) ?? trimmedText(asset?.bunny_original_url)

export const inferAssetVariant = (asset: MediaMigrationAsset): MediaVariantKey => {
  if (isMediaVariantKey(asset.variant)) return asset.variant

  const width = typeof asset.width === 'number' && Number.isFinite(asset.width) ? asset.width : null
  const height = typeof asset.height === 'number' && Number.isFinite(asset.height) ? asset.height : null
  if (!width || !height) return 'thumbnail'

  const ratio = width / height
  if (Math.abs(ratio - 1) <= 0.08) return 'square'
  if (ratio >= 2.15) return 'hero'
  if (ratio >= 1.82 && ratio <= 2.02) return 'open_graph'
  if (ratio >= 1.65) return 'wide'
  if (ratio >= 1.42) return 'thumbnail'
  if (ratio <= 0.9) return 'portrait'
  return 'editorial'
}

export const getRequiredVariantsForPublicUse = (input: {
  publicUse: 'article-header' | 'card-visual'
  hasSeoImage?: boolean
}): MediaVariantKey[] => {
  if (input.publicUse === 'card-visual') return ['thumbnail']

  // Migrated article media is also selectable in every curated homepage article block.
  // Those placements require square (article grids) and hero (featured lead cards).
  const variants: MediaVariantKey[] = ['thumbnail', 'square', 'wide', 'hero']
  if (input.hasSeoImage) variants.push('open_graph')
  return variants
}

export const selectBestSourceAsset = (
  mediaSet: MediaMigrationSet | null | undefined,
  directAsset?: MediaMigrationAsset | null,
): MediaMigrationAsset | null => {
  if (directAsset && pickSourceUrl(directAsset)) return directAsset

  const variants = mediaSet?.variants
  if (!variants) return null

  for (const variant of ['wide', 'thumbnail', 'open_graph', 'hero', 'editorial', 'square', 'portrait'] as const) {
    const asset = variants[variant]
    if (isRecord(asset) && pickSourceUrl(asset)) return asset as MediaMigrationAsset
  }

  return null
}

export const buildVariantGenerationPlan = (input: {
  mediaSet: MediaMigrationSet | null | undefined
  directAsset?: MediaMigrationAsset | null
  required: MediaVariantKey[]
}): VariantGenerationPlan => {
  const missing = input.required.filter((variant) => !hasVariantAsset(input.mediaSet, variant))
  const sourceAsset = selectBestSourceAsset(input.mediaSet, input.directAsset)

  return {
    required: input.required,
    missing,
    sourceAsset,
    generated: sourceAsset ? missing.map((variant) => GENERATED_VARIANT_SPECS[variant]) : [],
  }
}

export const buildGeneratedVariantFilename = (
  source: MediaMigrationAsset,
  variant: MediaVariantKey,
): string => {
  const raw = trimmedText(source.filename) ?? `media-${extractRelationshipId(source) ?? 'asset'}`
  const withoutExt = raw.replace(/\.[^.]+$/, '')
  return `${withoutExt}-${variant}.webp`
}

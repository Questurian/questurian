import {
  resolveLegacyAssetForPlacement,
  resolveMediaSetForPlacement,
  type MediaPlacement,
  type PublicImage,
} from '@/features/media/lib/resolve-public-image'

export type ArticleDocLike = {
  [key: string]: unknown
  headerSection?: unknown
  header?: unknown
}

export type BuildPublicArticleImageViewOptions = {
  placement: MediaPlacement
  allowMigrationFallback?: boolean
}

export type PublicArticleImageView = {
  featuredImage: PublicImage
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const missingImageForPlacement = (placement: MediaPlacement): PublicImage =>
  resolveMediaSetForPlacement(null, placement)

const getFeaturedHeaderSection = (doc: ArticleDocLike): Record<string, unknown> | null => {
  if (isRecord(doc.headerSection)) return doc.headerSection
  if (isRecord(doc.header)) return doc.header
  return null
}

export const resolveArticleFeaturedImage = (
  doc: ArticleDocLike,
  options: BuildPublicArticleImageViewOptions,
): PublicImage => {
  const { placement } = options
  const allowMigrationFallback = options.allowMigrationFallback ?? true
  const missingImage = missingImageForPlacement(placement)
  const section = getFeaturedHeaderSection(doc)
  if (!section) return missingImage

  const directMediaSet = isRecord(section.featuredMediaSet) ? section.featuredMediaSet : null
  if (directMediaSet) {
    const resolved = resolveMediaSetForPlacement(directMediaSet, placement, {
      allowMigrationFallback,
    })
    if (resolved.url) return resolved
  }

  const featuredImage = isRecord(section.featuredImage) ? section.featuredImage : null
  if (!featuredImage) return missingImage

  const assetMediaSet = isRecord(featuredImage.mediaSet) ? featuredImage.mediaSet : null
  if (assetMediaSet) {
    const resolved = resolveMediaSetForPlacement(assetMediaSet, placement, {
      allowMigrationFallback,
    })
    if (resolved.url) return resolved
  }

  if (!allowMigrationFallback) return missingImage

  const legacy = resolveLegacyAssetForPlacement(featuredImage, placement)
  return legacy.url ? legacy : missingImage
}

export const buildPublicArticleImageView = (
  doc: ArticleDocLike,
  options: BuildPublicArticleImageViewOptions,
): PublicArticleImageView => ({
  featuredImage: resolveArticleFeaturedImage(doc, options),
})

import type {
  MediaMigrationAsset,
  MediaMigrationSet,
} from '@/features/media/migration/finish-media-set-migration'

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export function hasSeoImage(doc: Record<string, unknown>): boolean {
  const seoSection = isRecord(doc.seoSection) ? doc.seoSection : null
  const openGraph = isRecord(seoSection?.openGraph) ? seoSection.openGraph : null
  const twitterCard = isRecord(seoSection?.twitterCard) ? seoSection.twitterCard : null

  return Boolean(
    (typeof openGraph?.imageUrl === 'string' && openGraph.imageUrl.trim()) ||
      (typeof twitterCard?.imageUrl === 'string' && twitterCard.imageUrl.trim()),
  )
}

export function mediaSetFromRelationship(value: unknown): MediaMigrationSet | null {
  return isRecord(value) ? (value as MediaMigrationSet) : null
}

export function assetFromRelationship(value: unknown): MediaMigrationAsset | null {
  return isRecord(value) ? (value as MediaMigrationAsset) : null
}

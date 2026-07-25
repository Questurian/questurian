import type { MediaVariantKey } from '@/features/media/constants'
import {
  buildMediaSetCreateData,
  extractRelationshipId,
  getMediaSetStatus,
  inferAssetVariant,
  type MediaMigrationAsset,
  type MediaMigrationSet,
} from '@/features/media/migration/finish-media-set-migration'
import type { MigrationContext } from './types'

export async function createMediaSetFromAsset(
  context: MigrationContext,
  asset: MediaMigrationAsset,
): Promise<string | number | null> {
  const createData = buildMediaSetCreateData(asset)

  if (!context.options.write) {
    context.counters.mediaSetsCreated += 1
    console.log(`[dry-run] create media-set "${createData.title}" from asset ${asset.id ?? 'unknown'}`)
    return `<new:${asset.id ?? 'media-set'}>`
  }

  const created = await context.payload.create({
    collection: 'media-sets',
    data: createData,
    overrideAccess: true,
  } as never)

  const id = extractRelationshipId(created)
  if (!id) throw new Error('created media-set had no id')

  context.counters.mediaSetsCreated += 1
  console.log(`[write] created media-set ${id} from asset ${asset.id ?? 'unknown'}`)
  return id
}

export async function linkSourceAssetVariant(
  context: MigrationContext,
  asset: MediaMigrationAsset,
  mediaSetId: string | number,
): Promise<MediaVariantKey | null> {
  const assetId = extractRelationshipId(asset)
  if (!assetId) return null

  const variant = inferAssetVariant(asset)
  const currentMediaSetId = extractRelationshipId(asset.mediaSet)

  if (
    currentMediaSetId &&
    String(currentMediaSetId) === String(mediaSetId) &&
    asset.variant === variant
  ) {
    return variant
  }

  if (!context.options.write) {
    context.counters.variantsLinked += 1
    console.log(`[dry-run] link asset ${assetId} as ${variant} on media-set ${mediaSetId}`)
    return variant
  }

  await context.payload.update({
    collection: 'media-assets',
    id: assetId,
    data: { mediaSet: mediaSetId, variant },
    overrideAccess: true,
  } as never)

  context.counters.variantsLinked += 1
  console.log(`[write] linked asset ${assetId} as ${variant} on media-set ${mediaSetId}`)
  return variant
}

export async function updateMediaSetStatus(
  context: MigrationContext,
  mediaSetId: string | number,
) {
  const mediaSet = (await context.payload.findByID({
    collection: 'media-sets',
    id: mediaSetId,
    depth: 0,
    overrideAccess: true,
  } as never)) as MediaMigrationSet

  const status = getMediaSetStatus(mediaSet.variants)

  if (!context.options.write) {
    context.counters.mediaSetStatusesUpdated += 1
    console.log(`[dry-run] set media-set ${mediaSetId} status=${status}`)
    return
  }

  await context.payload.update({
    collection: 'media-sets',
    id: mediaSetId,
    data: { status },
    overrideAccess: true,
  } as never)

  context.counters.mediaSetStatusesUpdated += 1
}

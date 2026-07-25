import {
  extractRelationshipId,
  getRequiredVariantsForPublicUse,
  type MediaMigrationSet,
} from '@/features/media/migration/finish-media-set-migration'
import { isRecord, mediaSetFromRelationship } from './document-values'
import { updateMediaSetStatus } from './media-set-operations'
import { loadMediaSetById } from './payload-queries'
import type { CardCollectionConfig, MigrationContext } from './types'
import { ensureMissingVariants } from './variant-generation'

async function auditCardMediaSet(
  context: MigrationContext,
  mediaSet: MediaMigrationSet,
) {
  const mediaSetId = extractRelationshipId(mediaSet)
  if (!mediaSetId) return

  await ensureMissingVariants(context, {
    mediaSet,
    mediaSetId,
    sourceAsset: null,
    required: getRequiredVariantsForPublicUse({ publicUse: 'card-visual' }),
  })

  if (context.options.write) await updateMediaSetStatus(context, mediaSetId)
}

async function resolveMediaSet(
  context: MigrationContext,
  value: unknown,
): Promise<MediaMigrationSet | null> {
  const populatedMediaSet = mediaSetFromRelationship(value)
  if (populatedMediaSet) return populatedMediaSet

  const mediaSetId = extractRelationshipId(value)
  return mediaSetId ? loadMediaSetById(context.payload, mediaSetId) : null
}

export async function auditCardDoc(
  context: MigrationContext,
  input: {
    config: CardCollectionConfig
    doc: Record<string, unknown>
  },
) {
  context.counters.scanned += 1
  const value = input.doc[input.config.field]

  if (input.config.field === 'gallery') {
    if (!Array.isArray(value)) return
    for (const row of value) {
      const mediaSet = await resolveMediaSet(context, isRecord(row) ? row.image : null)
      if (mediaSet) await auditCardMediaSet(context, mediaSet)
    }
    return
  }

  const mediaSet = await resolveMediaSet(context, value)
  if (mediaSet) await auditCardMediaSet(context, mediaSet)
}

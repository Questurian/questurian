import {
  extractRelationshipId,
  getRequiredVariantsForPublicUse,
  type MediaMigrationSet,
} from '@/features/media/migration/finish-media-set-migration'
import {
  assetFromRelationship,
  hasSeoImage,
  isRecord,
  mediaSetFromRelationship,
} from './document-values'
import {
  createMediaSetFromAsset,
  linkSourceAssetVariant,
  updateMediaSetStatus,
} from './media-set-operations'
import { loadMediaSetById } from './payload-queries'
import type { ArticleCollectionConfig, MigrationContext } from './types'
import { ensureMissingVariants } from './variant-generation'

export async function migrateArticleDoc(
  context: MigrationContext,
  input: {
    collection: ArticleCollectionConfig['collection']
    headerField: ArticleCollectionConfig['headerField']
    doc: Record<string, unknown>
  },
) {
  context.counters.scanned += 1
  const header = isRecord(input.doc[input.headerField])
    ? (input.doc[input.headerField] as Record<string, unknown>)
    : null
  if (!header) return

  const featuredImage = assetFromRelationship(header.featuredImage)
  const existingMediaSetId = extractRelationshipId(header.featuredMediaSet)
  let mediaSetId = existingMediaSetId
  let mediaSet = mediaSetFromRelationship(header.featuredMediaSet)

  if (!mediaSetId && featuredImage) {
    mediaSetId = extractRelationshipId(featuredImage.mediaSet)
    mediaSet = mediaSetFromRelationship(featuredImage.mediaSet)

    if (!mediaSetId) {
      mediaSetId = await createMediaSetFromAsset(context, featuredImage)
      mediaSet = { id: mediaSetId, variants: {} }
    }
  }

  if (!mediaSetId) return
  if (!mediaSet) mediaSet = await loadMediaSetById(context.payload, mediaSetId)

  if (featuredImage) {
    const sourceVariant = await linkSourceAssetVariant(context, featuredImage, mediaSetId)
    if (sourceVariant) {
      mediaSet = withLinkedVariant(mediaSet, mediaSetId, sourceVariant, featuredImage)
    }
  }

  await ensureMissingVariants(context, {
    mediaSet: mediaSet ?? { id: mediaSetId, variants: {} },
    mediaSetId,
    sourceAsset: featuredImage,
    required: getRequiredVariantsForPublicUse({
      publicUse: 'article-header',
      hasSeoImage: hasSeoImage(input.doc),
    }),
  })

  if (!existingMediaSetId) {
    await updateArticleMediaSetReference(context, input, header, mediaSetId)
  }

  if (context.options.write) await updateMediaSetStatus(context, mediaSetId)
}

function withLinkedVariant(
  mediaSet: MediaMigrationSet | null,
  mediaSetId: string | number,
  variant: keyof NonNullable<MediaMigrationSet['variants']>,
  featuredImage: NonNullable<ReturnType<typeof assetFromRelationship>>,
): MediaMigrationSet {
  return {
    ...(mediaSet ?? { id: mediaSetId }),
    variants: {
      ...(mediaSet?.variants ?? {}),
      [variant]: featuredImage,
    },
  }
}

async function updateArticleMediaSetReference(
  context: MigrationContext,
  input: {
    collection: ArticleCollectionConfig['collection']
    headerField: ArticleCollectionConfig['headerField']
    doc: Record<string, unknown>
  },
  header: Record<string, unknown>,
  mediaSetId: string | number,
) {
  if (!context.options.write) {
    context.counters.articleRefsUpdated += 1
    console.log(
      `[dry-run] set ${input.collection} ${input.doc.id} ${input.headerField}.featuredMediaSet=${mediaSetId}`,
    )
    return
  }

  await context.payload.update({
    collection: input.collection,
    id: input.doc.id as never,
    data: {
      [input.headerField]: {
        ...header,
        featuredImage: extractRelationshipId(header.featuredImage),
        featuredMediaSet: mediaSetId,
      },
    },
    overrideAccess: true,
  } as never)
  context.counters.articleRefsUpdated += 1
  console.log(`[write] set ${input.collection} ${input.doc.id} featuredMediaSet=${mediaSetId}`)
}

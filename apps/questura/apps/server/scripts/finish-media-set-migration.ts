import 'dotenv/config'

import { getPayload } from 'payload'
import sharp from 'sharp'

import config from '@/payload.config'
import type { MediaVariantKey } from '@/features/media/constants'
import {
  buildGeneratedVariantFilename,
  buildMediaSetCreateData,
  buildVariantGenerationPlan,
  extractRelationshipId,
  getMediaSetStatus,
  getRequiredVariantsForPublicUse,
  inferAssetVariant,
  pickSourceUrl,
  type MediaMigrationAsset,
  type MediaMigrationSet,
} from '@/features/media/migration/finish-media-set-migration'

type PayloadClient = Awaited<ReturnType<typeof getPayload>>

type CliOptions = {
  help: boolean
  write: boolean
  generateVariants: boolean
  limit: number
  maxDocs: number | null
}

type Counters = {
  scanned: number
  mediaSetsCreated: number
  articleRefsUpdated: number
  variantsLinked: number
  variantsGenerated: number
  mediaSetStatusesUpdated: number
  skipped: number
  errors: number
}

type ArticleCollectionConfig = {
  collection: 'articles' | 'single-type-listicles' | 'listicle-itineraries'
  headerField: 'headerSection' | 'header'
}

type CardCollectionConfig = {
  collection:
    | 'locations'
    | 'accommodations'
    | 'dining'
    | 'attractions'
    | 'tours'
    | 'nightlife'
    | 'key-locations'
  field: 'coverImage' | 'gallery' | 'img'
}

const ARTICLE_COLLECTIONS: ArticleCollectionConfig[] = [
  { collection: 'articles', headerField: 'headerSection' },
  { collection: 'single-type-listicles', headerField: 'header' },
  { collection: 'listicle-itineraries', headerField: 'header' },
]

const CARD_COLLECTIONS: CardCollectionConfig[] = [
  { collection: 'locations', field: 'coverImage' },
  { collection: 'accommodations', field: 'gallery' },
  { collection: 'dining', field: 'gallery' },
  { collection: 'attractions', field: 'gallery' },
  { collection: 'tours', field: 'img' },
  { collection: 'nightlife', field: 'gallery' },
  { collection: 'key-locations', field: 'gallery' },
]

const counters: Counters = {
  scanned: 0,
  mediaSetsCreated: 0,
  articleRefsUpdated: 0,
  variantsLinked: 0,
  variantsGenerated: 0,
  mediaSetStatusesUpdated: 0,
  skipped: 0,
  errors: 0,
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const parseOptions = (): CliOptions => {
  const args = new Set(process.argv.slice(2))
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))
  const maxDocsArg = process.argv.find((arg) => arg.startsWith('--max-docs='))
  const parsedLimit = limitArg ? Number(limitArg.split('=')[1]) : 100
  const parsedMaxDocs = maxDocsArg ? Number(maxDocsArg.split('=')[1]) : null

  return {
    help: args.has('--help') || args.has('-h'),
    write: args.has('--write'),
    generateVariants: !args.has('--skip-generate'),
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.trunc(parsedLimit) : 100,
    maxDocs:
      parsedMaxDocs !== null && Number.isFinite(parsedMaxDocs) && parsedMaxDocs > 0
        ? Math.trunc(parsedMaxDocs)
        : null,
  }
}

function printHelp() {
  console.log(`Usage:
  pnpm migrate:media-sets
  pnpm migrate:media-sets -- --max-docs=5
  pnpm migrate:media-sets -- --write

Options:
  --write           Apply DB changes. Default is dry-run.
  --skip-generate   Do not generate missing variant assets.
  --limit=N         Payload page size. Default 100.
  --max-docs=N      Stop after N docs per collection for smoke checks.
  --help            Print this help text.
`)
}

async function fetchAll(
  payload: PayloadClient,
  collection: string,
  options: { depth: number; select?: Record<string, unknown>; limit: number; maxDocs: number | null },
): Promise<Record<string, unknown>[]> {
  const docs: Record<string, unknown>[] = []
  let page = 1
  let totalPages = 1

  do {
    const response = await payload.find({
      collection: collection as never,
      depth: options.depth,
      limit: options.limit,
      page,
      overrideAccess: true,
      select: options.select,
    } as never)

    const pageDocs = (response.docs || []) as Record<string, unknown>[]
    docs.push(...(options.maxDocs ? pageDocs.slice(0, Math.max(options.maxDocs - docs.length, 0)) : pageDocs))
    totalPages = response.totalPages || 1
    page += 1
  } while (page <= totalPages && (!options.maxDocs || docs.length < options.maxDocs))

  return docs
}

function hasSeoImage(doc: Record<string, unknown>): boolean {
  const seoSection = isRecord(doc.seoSection) ? doc.seoSection : null
  const openGraph = isRecord(seoSection?.openGraph) ? seoSection.openGraph : null
  const twitterCard = isRecord(seoSection?.twitterCard) ? seoSection.twitterCard : null

  return Boolean(
    (typeof openGraph?.imageUrl === 'string' && openGraph.imageUrl.trim()) ||
      (typeof twitterCard?.imageUrl === 'string' && twitterCard.imageUrl.trim()),
  )
}

function mediaSetFromRelationship(value: unknown): MediaMigrationSet | null {
  return isRecord(value) ? (value as MediaMigrationSet) : null
}

function assetFromRelationship(value: unknown): MediaMigrationAsset | null {
  return isRecord(value) ? (value as MediaMigrationAsset) : null
}

async function loadMediaSetById(
  payload: PayloadClient,
  mediaSetId: string | number,
): Promise<MediaMigrationSet | null> {
  const mediaSet = await payload.findByID({
    collection: 'media-sets',
    id: mediaSetId,
    depth: 1,
    overrideAccess: true,
    select: {
      id: true,
      title: true,
      variants: true,
      alt_text: true,
      photographer_credit: true,
      location: true,
      locationRef: true,
      location_finalized: true,
      tags: true,
    },
  } as never)

  return isRecord(mediaSet) ? (mediaSet as MediaMigrationSet) : null
}

async function createMediaSetFromAsset(
  payload: PayloadClient,
  asset: MediaMigrationAsset,
  options: CliOptions,
): Promise<string | number | null> {
  const createData = buildMediaSetCreateData(asset)

  if (!options.write) {
    counters.mediaSetsCreated += 1
    console.log(`[dry-run] create media-set "${createData.title}" from asset ${asset.id ?? 'unknown'}`)
    return `<new:${asset.id ?? 'media-set'}>`
  }

  const created = await payload.create({
    collection: 'media-sets',
    data: createData,
    overrideAccess: true,
  } as never)

  const id = extractRelationshipId(created)
  if (!id) throw new Error('created media-set had no id')

  counters.mediaSetsCreated += 1
  console.log(`[write] created media-set ${id} from asset ${asset.id ?? 'unknown'}`)
  return id
}

async function linkSourceAssetVariant(
  payload: PayloadClient,
  asset: MediaMigrationAsset,
  mediaSetId: string | number,
  options: CliOptions,
): Promise<MediaVariantKey | null> {
  const assetId = extractRelationshipId(asset)
  if (!assetId) return null

  const variant = inferAssetVariant(asset)
  const currentMediaSetId = extractRelationshipId(asset.mediaSet)

  if (currentMediaSetId && String(currentMediaSetId) === String(mediaSetId) && asset.variant === variant) {
    return variant
  }

  if (!options.write) {
    counters.variantsLinked += 1
    console.log(`[dry-run] link asset ${assetId} as ${variant} on media-set ${mediaSetId}`)
    return variant
  }

  await payload.update({
    collection: 'media-assets',
    id: assetId,
    data: {
      mediaSet: mediaSetId,
      variant,
    },
    overrideAccess: true,
  } as never)

  counters.variantsLinked += 1
  console.log(`[write] linked asset ${assetId} as ${variant} on media-set ${mediaSetId}`)
  return variant
}

async function generateVariantAsset(input: {
  payload: PayloadClient
  mediaSetId: string | number
  sourceAsset: MediaMigrationAsset
  variant: MediaVariantKey
  options: CliOptions
}): Promise<string | number | null> {
  const spec = buildVariantGenerationPlan({
    mediaSet: null,
    directAsset: input.sourceAsset,
    required: [input.variant],
  }).generated[0]
  const sourceUrl = pickSourceUrl(input.sourceAsset)

  if (!spec || !sourceUrl) return null

  const filename = buildGeneratedVariantFilename(input.sourceAsset, input.variant)

  if (!input.options.write) {
    counters.variantsGenerated += 1
    console.log(
      `[dry-run] generate ${input.variant} ${spec.width}x${spec.height} from ${sourceUrl} as ${filename}`,
    )
    return null
  }

  const response = await fetch(sourceUrl)
  if (!response.ok) {
    throw new Error(`failed to fetch source image ${sourceUrl}: ${response.status}`)
  }

  const source = Buffer.from(await response.arrayBuffer())
  const output = await sharp(source)
    .resize(spec.width, spec.height, { fit: spec.fit })
    .webp({ quality: 86 })
    .toBuffer()

  const created = await input.payload.create({
    collection: 'media-assets',
    data: {
      mediaSet: input.mediaSetId,
      variant: input.variant,
      alt_text: input.sourceAsset.alt_text ?? undefined,
      photographer_credit: input.sourceAsset.photographer_credit ?? undefined,
      location: input.sourceAsset.location ?? undefined,
      locationRef: extractRelationshipId(input.sourceAsset.locationRef) ?? undefined,
      location_finalized: input.sourceAsset.location_finalized ?? undefined,
      tags: input.sourceAsset.tags ?? undefined,
    },
    file: {
      data: output,
      mimetype: 'image/webp',
      name: filename,
      size: output.byteLength,
    },
    overrideAccess: true,
  } as never)

  const id = extractRelationshipId(created)
  counters.variantsGenerated += 1
  console.log(`[write] generated ${input.variant} asset ${id ?? 'unknown'} on media-set ${input.mediaSetId}`)
  return id
}

async function ensureMissingVariants(input: {
  payload: PayloadClient
  mediaSet: MediaMigrationSet
  mediaSetId: string | number
  sourceAsset: MediaMigrationAsset | null
  required: MediaVariantKey[]
  options: CliOptions
}) {
  const plan = buildVariantGenerationPlan({
    mediaSet: input.mediaSet,
    directAsset: input.sourceAsset,
    required: input.required,
  })

  if (plan.missing.length === 0) return

  if (!plan.sourceAsset || !pickSourceUrl(plan.sourceAsset)) {
    counters.skipped += 1
    console.log(
      `[skip] media-set ${input.mediaSetId} missing ${plan.missing.join(', ')} but has no fetchable source asset`,
    )
    return
  }

  if (!input.options.generateVariants) {
    counters.skipped += 1
    console.log(`[skip] media-set ${input.mediaSetId} missing ${plan.missing.join(', ')}; generation disabled`)
    return
  }

  for (const variant of plan.missing) {
    await generateVariantAsset({
      payload: input.payload,
      mediaSetId: input.mediaSetId,
      sourceAsset: plan.sourceAsset,
      variant,
      options: input.options,
    })
  }
}

async function updateMediaSetStatus(
  payload: PayloadClient,
  mediaSetId: string | number,
  options: CliOptions,
) {
  const mediaSet = (await payload.findByID({
    collection: 'media-sets',
    id: mediaSetId,
    depth: 0,
    overrideAccess: true,
  } as never)) as MediaMigrationSet

  const status = getMediaSetStatus(mediaSet.variants)

  if (!options.write) {
    counters.mediaSetStatusesUpdated += 1
    console.log(`[dry-run] set media-set ${mediaSetId} status=${status}`)
    return
  }

  await payload.update({
    collection: 'media-sets',
    id: mediaSetId,
    data: { status },
    overrideAccess: true,
  } as never)

  counters.mediaSetStatusesUpdated += 1
}

async function migrateArticleDoc(input: {
  payload: PayloadClient
  collection: ArticleCollectionConfig['collection']
  headerField: ArticleCollectionConfig['headerField']
  doc: Record<string, unknown>
  options: CliOptions
}) {
  counters.scanned += 1
  const header = isRecord(input.doc[input.headerField])
    ? (input.doc[input.headerField] as Record<string, unknown>)
    : null
  if (!header) return

  const directMediaSet = mediaSetFromRelationship(header.featuredMediaSet)
  const featuredImage = assetFromRelationship(header.featuredImage)
  const existingMediaSetId = extractRelationshipId(header.featuredMediaSet)
  let mediaSetId = existingMediaSetId
  let mediaSet = directMediaSet

  if (!mediaSetId && featuredImage) {
    const assetMediaSet = mediaSetFromRelationship(featuredImage.mediaSet)
    const assetMediaSetId = extractRelationshipId(featuredImage.mediaSet)
    mediaSetId = assetMediaSetId
    mediaSet = assetMediaSet

    if (!mediaSetId) {
      mediaSetId = await createMediaSetFromAsset(input.payload, featuredImage, input.options)
      mediaSet = { id: mediaSetId, variants: {} }
    }
  }

  if (!mediaSetId) return

  if (!mediaSet) {
    mediaSet = await loadMediaSetById(input.payload, mediaSetId)
  }

  if (featuredImage) {
    const sourceVariant = await linkSourceAssetVariant(
      input.payload,
      featuredImage,
      mediaSetId,
      input.options,
    )
    if (sourceVariant) {
      mediaSet = {
        ...(mediaSet ?? { id: mediaSetId }),
        variants: {
          ...(mediaSet?.variants ?? {}),
          [sourceVariant]: featuredImage,
        },
      }
    }
  }

  const required = getRequiredVariantsForPublicUse({
    publicUse: 'article-header',
    hasSeoImage: hasSeoImage(input.doc),
  })

  await ensureMissingVariants({
    payload: input.payload,
    mediaSet: mediaSet ?? { id: mediaSetId, variants: {} },
    mediaSetId,
    sourceAsset: featuredImage,
    required,
    options: input.options,
  })

  if (!existingMediaSetId) {
    if (!input.options.write) {
      counters.articleRefsUpdated += 1
      console.log(`[dry-run] set ${input.collection} ${input.doc.id} ${input.headerField}.featuredMediaSet=${mediaSetId ?? '<new>'}`)
    } else {
      await input.payload.update({
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
      counters.articleRefsUpdated += 1
      console.log(`[write] set ${input.collection} ${input.doc.id} featuredMediaSet=${mediaSetId}`)
    }
  }

  if (input.options.write) await updateMediaSetStatus(input.payload, mediaSetId, input.options)
}

async function auditCardMediaSet(input: {
  payload: PayloadClient
  mediaSet: MediaMigrationSet
  label: string
  options: CliOptions
}) {
  const mediaSetId = extractRelationshipId(input.mediaSet)
  if (!mediaSetId) return

  await ensureMissingVariants({
    payload: input.payload,
    mediaSet: input.mediaSet,
    mediaSetId,
    sourceAsset: null,
    required: getRequiredVariantsForPublicUse({ publicUse: 'card-visual' }),
    options: input.options,
  })

  if (input.options.write) await updateMediaSetStatus(input.payload, mediaSetId, input.options)
}

async function auditCardDoc(input: {
  payload: PayloadClient
  config: CardCollectionConfig
  doc: Record<string, unknown>
  options: CliOptions
}) {
  counters.scanned += 1
  const value = input.doc[input.config.field]

  if (input.config.field === 'gallery') {
    if (!Array.isArray(value)) return
    for (const [index, row] of value.entries()) {
      let mediaSet = isRecord(row) ? mediaSetFromRelationship(row.image) : null
      const mediaSetId = isRecord(row) ? extractRelationshipId(row.image) : null
      if (!mediaSet && mediaSetId) {
        mediaSet = await loadMediaSetById(input.payload, mediaSetId)
      }
      if (mediaSet) {
        await auditCardMediaSet({
          payload: input.payload,
          mediaSet,
          label: `${input.config.collection} ${input.doc.id} gallery[${index}]`,
          options: input.options,
        })
      }
    }
    return
  }

  let mediaSet = mediaSetFromRelationship(value)
  const mediaSetId = extractRelationshipId(value)
  if (!mediaSet && mediaSetId) {
    mediaSet = await loadMediaSetById(input.payload, mediaSetId)
  }

  if (mediaSet) {
    await auditCardMediaSet({
      payload: input.payload,
      mediaSet,
      label: `${input.config.collection} ${input.doc.id} ${input.config.field}`,
      options: input.options,
    })
  }
}

async function main() {
  const options = parseOptions()
  if (options.help) {
    printHelp()
    return
  }

  console.log(options.write ? '[write] media-set migration starting' : '[dry-run] media-set migration starting')
  if (options.write) {
    console.log('Write mode enabled. Verify DB backup before running this command.')
  }

  const payload = await getPayload({ config })

  for (const articleConfig of ARTICLE_COLLECTIONS) {
    const docs = await fetchAll(payload, articleConfig.collection, {
      depth: 2,
      limit: options.limit,
      maxDocs: options.maxDocs,
      select: {
        id: true,
        title: true,
        [articleConfig.headerField]: true,
        seoSection: true,
      },
    })

    for (const doc of docs) {
      try {
        await migrateArticleDoc({
          payload,
          collection: articleConfig.collection,
          headerField: articleConfig.headerField,
          doc,
          options,
        })
      } catch (error) {
        counters.errors += 1
        console.error(`[error] ${articleConfig.collection} ${doc.id}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  for (const cardConfig of CARD_COLLECTIONS) {
    const docs = await fetchAll(payload, cardConfig.collection, {
      depth: 2,
      limit: options.limit,
      maxDocs: options.maxDocs,
      select: {
        id: true,
        title: true,
        [cardConfig.field]: true,
      },
    })

    for (const doc of docs) {
      try {
        await auditCardDoc({
          payload,
          config: cardConfig,
          doc,
          options,
        })
      } catch (error) {
        counters.errors += 1
        console.error(`[error] ${cardConfig.collection} ${doc.id}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  console.log('\nSummary')
  console.log(JSON.stringify(counters, null, 2))

  if (counters.errors > 0) process.exit(1)
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

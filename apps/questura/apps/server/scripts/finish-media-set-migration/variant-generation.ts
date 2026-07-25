import sharp from 'sharp'

import type { MediaVariantKey } from '@/features/media/constants'
import {
  buildGeneratedVariantFilename,
  buildVariantGenerationPlan,
  extractRelationshipId,
  pickSourceUrl,
  type MediaMigrationAsset,
  type MediaMigrationSet,
} from '@/features/media/migration/finish-media-set-migration'
import type { MigrationContext } from './types'

async function generateVariantAsset(
  context: MigrationContext,
  input: {
    mediaSetId: string | number
    sourceAsset: MediaMigrationAsset
    variant: MediaVariantKey
  },
): Promise<string | number | null> {
  const spec = buildVariantGenerationPlan({
    mediaSet: null,
    directAsset: input.sourceAsset,
    required: [input.variant],
  }).generated[0]
  const sourceUrl = pickSourceUrl(input.sourceAsset)

  if (!spec || !sourceUrl) return null

  const filename = buildGeneratedVariantFilename(input.sourceAsset, input.variant)

  if (!context.options.write) {
    context.counters.variantsGenerated += 1
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

  const created = await context.payload.create({
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
  context.counters.variantsGenerated += 1
  console.log(
    `[write] generated ${input.variant} asset ${id ?? 'unknown'} on media-set ${input.mediaSetId}`,
  )
  return id
}

export async function ensureMissingVariants(
  context: MigrationContext,
  input: {
    mediaSet: MediaMigrationSet
    mediaSetId: string | number
    sourceAsset: MediaMigrationAsset | null
    required: MediaVariantKey[]
  },
) {
  const plan = buildVariantGenerationPlan({
    mediaSet: input.mediaSet,
    directAsset: input.sourceAsset,
    required: input.required,
  })

  if (plan.missing.length === 0) return

  if (!plan.sourceAsset || !pickSourceUrl(plan.sourceAsset)) {
    context.counters.skipped += 1
    console.log(
      `[skip] media-set ${input.mediaSetId} missing ${plan.missing.join(', ')} but has no fetchable source asset`,
    )
    return
  }

  if (!context.options.generateVariants) {
    context.counters.skipped += 1
    console.log(
      `[skip] media-set ${input.mediaSetId} missing ${plan.missing.join(', ')}; generation disabled`,
    )
    return
  }

  for (const variant of plan.missing) {
    await generateVariantAsset(context, {
      mediaSetId: input.mediaSetId,
      sourceAsset: plan.sourceAsset,
      variant,
    })
  }
}

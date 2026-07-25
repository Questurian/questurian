import type { MediaMigrationSet } from '@/features/media/migration/finish-media-set-migration'
import { isRecord } from './document-values'
import type { CliOptions, PayloadClient } from './types'

export async function fetchAll(
  payload: PayloadClient,
  collection: string,
  options: Pick<CliOptions, 'limit' | 'maxDocs'> & {
    depth: number
    select?: Record<string, unknown>
  },
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

    const pageDocs = (response.docs || []) as unknown as Record<string, unknown>[]
    const remaining = options.maxDocs
      ? pageDocs.slice(0, Math.max(options.maxDocs - docs.length, 0))
      : pageDocs
    docs.push(...remaining)
    totalPages = response.totalPages || 1
    page += 1
  } while (page <= totalPages && (!options.maxDocs || docs.length < options.maxDocs))

  return docs
}

export async function loadMediaSetById(
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

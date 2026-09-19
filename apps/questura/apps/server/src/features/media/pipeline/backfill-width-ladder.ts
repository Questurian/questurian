import sharp from 'sharp'
import type { Payload } from 'payload'

import { MEDIA_VARIANT_KEYS, type MediaVariantKey } from '@/features/media/constants'
import { VARIANT_SPECS, WEBP_QUALITY } from './variant-specs'
import { WIDTH_LADDER, isLadderFilename, ladderFilename } from './width-ladder'

/**
 * Backfill for issue #563: give every already-published variant its small
 * siblings.
 *
 * The safety property that shapes this whole module: **it never writes to the
 * database.** It reads variant rows, fetches the files those rows already point
 * at, and PUTs new files under new names. No MediaAsset is updated, no MediaSet
 * is reassembled, no buffer belonging to an existing file is ever re-uploaded.
 *
 * That matters because the last mass regeneration corrupted MediaSet bytes, and
 * unwinding it was expensive. An add-only job cannot repeat that: the worst
 * case here is a rung that fails to appear, which this reports and which a
 * re-run fixes. Existing files are untouched by construction, not by care.
 *
 * It is also resumable. Every rung is checked for existence before any pixel
 * work happens, so a re-run after a failure costs a HEAD per rung and nothing
 * else.
 */

const SOURCE_MIME = 'image/webp'

export type LadderBackfillResult = {
  assetId: number
  filename: string
  variant: MediaVariantKey
  written: number[]
  alreadyPresent: number[]
  failed: Array<{ width: number; reason: string }>
}

export type LadderBackfillSummary = {
  assetsVisited: number
  assetsSkipped: number
  rungsWritten: number
  rungsAlreadyPresent: number
  results: LadderBackfillResult[]
  failures: Array<{ assetId: number; filename: string; reason: string }>
}

const bunnyStorageUrl = (filename: string): string => {
  const zoneName = process.env.BUNNY_STORAGE_ZONE_NAME
  if (!zoneName) throw new Error('BUNNY_STORAGE_ZONE_NAME is not set')
  return `https://ny.storage.bunnycdn.com/${zoneName}/media/${encodeURIComponent(filename)}`
}

const bunnyKey = (): string => {
  const apiKey = process.env.BUNNY_STORAGE_API_KEY
  if (!apiKey) throw new Error('BUNNY_STORAGE_API_KEY is not set')
  return apiKey
}

export type LadderIo = {
  /** Every filename in the media zone. */
  list: () => Promise<string[]>
  exists: (filename: string) => Promise<boolean>
  read: (filename: string) => Promise<Buffer>
  write: (filename: string, buffer: Buffer) => Promise<void>
  remove: (filename: string) => Promise<void>
}

const BUNNY_STORAGE_LIST_URL = () => {
  const zoneName = process.env.BUNNY_STORAGE_ZONE_NAME
  if (!zoneName) throw new Error('BUNNY_STORAGE_ZONE_NAME is not set')
  return `https://ny.storage.bunnycdn.com/${zoneName}/media/`
}

export const bunnyLadderIo: LadderIo = {
  list: async () => {
    const response = await fetch(BUNNY_STORAGE_LIST_URL(), {
      headers: { AccessKey: bunnyKey(), Accept: 'application/json' },
    })
    if (!response.ok) {
      throw new Error(`Could not list the media zone (${response.status})`)
    }
    const entries = (await response.json()) as Array<{ ObjectName?: string; IsDirectory?: boolean }>
    return entries
      .filter((entry) => !entry.IsDirectory && typeof entry.ObjectName === 'string')
      .map((entry) => entry.ObjectName as string)
  },
  exists: async (filename) => {
    const response = await fetch(bunnyStorageUrl(filename), {
      method: 'HEAD',
      headers: { AccessKey: bunnyKey() },
    })
    return response.ok
  },
  read: async (filename) => {
    const response = await fetch(bunnyStorageUrl(filename), {
      headers: { AccessKey: bunnyKey() },
    })
    if (!response.ok) {
      throw new Error(`Could not read ${filename} from Bunny (${response.status})`)
    }
    return Buffer.from(await response.arrayBuffer())
  },
  write: async (filename, buffer) => {
    const response = await fetch(bunnyStorageUrl(filename), {
      method: 'PUT',
      headers: { AccessKey: bunnyKey(), 'Content-Type': SOURCE_MIME },
      body: new Uint8Array(buffer),
    })
    if (!response.ok) {
      throw new Error(`Could not write ${filename} to Bunny (${response.status})`)
    }
  },
  remove: async (filename) => {
    const response = await fetch(bunnyStorageUrl(filename), {
      method: 'DELETE',
      headers: { AccessKey: bunnyKey() },
    })
    // A rung that is already gone is the state we wanted.
    if (!response.ok && response.status !== 404) {
      throw new Error(`Could not delete ${filename} from Bunny (${response.status})`)
    }
  },
}

const isVariantKey = (value: unknown): value is MediaVariantKey =>
  typeof value === 'string' && MEDIA_VARIANT_KEYS.includes(value as MediaVariantKey)

/**
 * Read the shape off the filename, the same way the reader-facing client does.
 * Agreeing on this one rule is what keeps the two sides in step: the job
 * ladders exactly the files the client will go on to ask about.
 */
export const variantFromFilename = (filename: string): MediaVariantKey | null => {
  if (isLadderFilename(filename)) return null
  const match = /_([a-z_]+)\.[A-Za-z0-9]+$/.exec(filename)
  const variant = match?.[1]
  return isVariantKey(variant) ? variant : null
}

/**
 * Rungs are resized from the published variant file rather than re-cropped from
 * the original source. A rung must be the *same picture* as the file it stands
 * in for: re-cropping would re-run focal-point maths that may since have moved,
 * and the browser would change composition when it changed rung.
 */
export const ladderFromVariantFile = async (
  variantBuffer: Buffer,
  variant: MediaVariantKey,
  widths: readonly number[] = WIDTH_LADDER,
): Promise<Array<{ width: number; height: number; buffer: Buffer }>> => {
  const spec = VARIANT_SPECS[variant]
  const image = sharp(variantBuffer)

  const rungs = []
  for (const width of widths) {
    const height = Math.round((width * spec.height) / spec.width)
    rungs.push({
      width,
      height,
      buffer: await image
        .clone()
        .resize(width, height, { fit: 'fill' })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer(),
    })
  }

  return rungs
}

export const backfillAssetLadder = async (
  asset: { id: number; filename: string; variant: MediaVariantKey },
  io: LadderIo,
  /**
   * Every filename already known to exist. A caller that has just listed the
   * zone can answer "is this rung there?" from memory; without it each rung
   * costs a HEAD, which is five network round trips per photo before any work
   * begins -- the difference between minutes and days across six thousand.
   */
  knownFiles?: ReadonlySet<string>,
): Promise<LadderBackfillResult> => {
  const result: LadderBackfillResult = {
    assetId: asset.id,
    filename: asset.filename,
    variant: asset.variant,
    written: [],
    alreadyPresent: [],
    failed: [],
  }

  const missing: number[] = []
  for (const width of WIDTH_LADDER) {
    const rung = ladderFilename(asset.filename, width)
    const present = knownFiles ? knownFiles.has(rung) : await io.exists(rung)
    if (present) {
      result.alreadyPresent.push(width)
    } else {
      missing.push(width)
    }
  }

  // Decided before any decode: a fully-backfilled asset must cost HEADs only,
  // so a re-run over thousands of photos is cheap enough to be routine.
  if (missing.length === 0) return result

  const variantBuffer = await io.read(asset.filename)
  const rungs = await ladderFromVariantFile(variantBuffer, asset.variant, missing)

  for (const rung of rungs) {
    try {
      await io.write(ladderFilename(asset.filename, rung.width), rung.buffer)
      result.written.push(rung.width)
    } catch (error) {
      result.failed.push({
        width: rung.width,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return result
}

export type BackfillOptions = {
  payload: Payload
  io?: LadderIo
  /** Report what would be written without writing anything. */
  dryRun?: boolean
  pageSize?: number
  onProgress?: (result: LadderBackfillResult) => void
}

export const backfillWidthLadder = async ({
  payload,
  io = bunnyLadderIo,
  dryRun = false,
  pageSize = 100,
  onProgress,
}: BackfillOptions): Promise<LadderBackfillSummary> => {
  const summary: LadderBackfillSummary = {
    assetsVisited: 0,
    assetsSkipped: 0,
    rungsWritten: 0,
    rungsAlreadyPresent: 0,
    results: [],
    failures: [],
  }

  const effectiveIo: LadderIo = dryRun
    ? { ...io, write: async () => undefined }
    : io

  let page = 1
  let hasNextPage = true

  while (hasNextPage) {
    const { docs, hasNextPage: more } = await payload.find({
      collection: 'media-assets',
      where: { variant: { exists: true } },
      limit: pageSize,
      page,
      depth: 0,
      overrideAccess: true,
      pagination: true,
    })

    for (const doc of docs) {
      const filename = typeof doc.filename === 'string' ? doc.filename : null
      const variant = doc.variant

      // A source upload or a legacy row without a recognizable variant has no
      // spec to resize against, so it is left exactly as it is.
      if (!filename || !isVariantKey(variant)) {
        summary.assetsSkipped += 1
        continue
      }

      try {
        const result = await backfillAssetLadder({ id: doc.id as number, filename, variant }, effectiveIo)
        summary.assetsVisited += 1
        summary.rungsWritten += result.written.length
        summary.rungsAlreadyPresent += result.alreadyPresent.length
        summary.results.push(result)
        for (const failure of result.failed) {
          summary.failures.push({
            assetId: result.assetId,
            filename: result.filename,
            reason: `w${failure.width}: ${failure.reason}`,
          })
        }
        onProgress?.(result)
      } catch (error) {
        summary.failures.push({
          assetId: doc.id as number,
          filename,
          reason: error instanceof Error ? error.message : String(error),
        })
      }
    }

    hasNextPage = Boolean(more)
    page += 1
  }

  return summary
}


/**
 * Backfill driven by the storage zone rather than by MediaAsset rows.
 *
 * This is the one to reach for. The client asks for a rung because it
 * recognized a *filename*, not because a database row told it to, so the set of
 * files that needs rungs is exactly the set of variant files on Bunny — which
 * is what this reads. A row-driven pass can only ever cover what its database
 * happens to know about, and there is more than one database in this project's
 * history.
 *
 * It also means the job needs no database connection at all, which is what lets
 * it run from a laptop that cannot reach the live one.
 */
export const backfillZoneLadder = async ({
  io = bunnyLadderIo,
  dryRun = false,
  /**
   * Each photo is one download, five resizes and five uploads, and almost all
   * of that is waiting on a round trip to the storage region. Run in parallel
   * or the wall-clock time is measured in days.
   */
  concurrency = 12,
  onProgress,
}: {
  io?: LadderIo
  dryRun?: boolean
  concurrency?: number
  onProgress?: (result: LadderBackfillResult) => void
} = {}): Promise<LadderBackfillSummary> => {
  const summary: LadderBackfillSummary = {
    assetsVisited: 0,
    assetsSkipped: 0,
    rungsWritten: 0,
    rungsAlreadyPresent: 0,
    results: [],
    failures: [],
  }

  const effectiveIo: LadderIo = dryRun ? { ...io, write: async () => undefined } : io
  const filenames = await io.list()
  const present = new Set(filenames)

  const queue: Array<{ filename: string; variant: MediaVariantKey }> = []
  for (const filename of filenames) {
    const variant = variantFromFilename(filename)
    // Sources, legacy uploads and the rungs themselves all land here. None of
    // them has a shape to resize against, and the client will not ask for them.
    if (!variant) {
      summary.assetsSkipped += 1
      continue
    }
    queue.push({ filename, variant })
  }

  let next = 0
  const worker = async () => {
    while (next < queue.length) {
      const { filename, variant } = queue[next++]
      try {
        const result = await backfillAssetLadder(
          { id: 0, filename, variant },
          effectiveIo,
          present,
        )
        summary.assetsVisited += 1
        summary.rungsWritten += result.written.length
        summary.rungsAlreadyPresent += result.alreadyPresent.length
        summary.results.push(result)
        for (const failure of result.failed) {
          summary.failures.push({
            assetId: 0,
            filename,
            reason: `w${failure.width}: ${failure.reason}`,
          })
        }
        onProgress?.(result)
      } catch (error) {
        summary.failures.push({
          assetId: 0,
          filename,
          reason: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker))

  return summary
}

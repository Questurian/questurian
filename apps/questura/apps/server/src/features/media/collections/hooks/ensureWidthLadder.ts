import type { CollectionAfterChangeHook } from 'payload'

import { MEDIA_VARIANT_KEYS, type MediaVariantKey } from '@/features/media/constants'
import {
  backfillAssetLadder,
  bunnyLadderIo,
  type LadderIo,
} from '@/features/media/pipeline/backfill-width-ladder'
import { isLadderFilename } from '@/features/media/pipeline/width-ladder'

/**
 * The backstop for issue #563: a variant file must never exist without its
 * width rungs.
 *
 * The reader-facing client derives rung names from a variant URL rather than
 * reading a manifest, which is what lets the two halves stay in separate apps.
 * The cost of that is an obligation: a rung it names and the CDN does not have
 * is a broken image, because `srcSet` has no error recovery. So every route
 * that can produce a variant file has to produce rungs too.
 *
 * `assembleMediaSetFromSource` and `regenerateVariantsForMediaSet` both do it
 * inline, which covers the two routes that matter. This hook covers the third:
 * attaching a freshly uploaded asset to a MediaSet's empty variant slot from
 * the admin panel or the REST API. `ensureMediaSetVariant` allows exactly that,
 * so without this the ladder would depend on someone remembering.
 *
 * It writes files only, never documents, and skips immediately when the rungs
 * are already there -- so the common case, an asset the pipeline just handled,
 * costs five HEAD requests and no image work.
 *
 * A failure here is logged rather than thrown. Losing the upload would be a
 * worse outcome than a photo that serves at full size until the backfill picks
 * it up, which is what the reader saw before any of this existed.
 */

const isVariantKey = (value: unknown): value is MediaVariantKey =>
  typeof value === 'string' && MEDIA_VARIANT_KEYS.includes(value as MediaVariantKey)

export const ensureWidthLadder =
  (io: LadderIo = bunnyLadderIo): CollectionAfterChangeHook =>
  async ({ doc, previousDoc, req }) => {
    const filename = typeof doc?.filename === 'string' ? doc.filename : null
    const variant = doc?.variant

    if (!filename || !isVariantKey(variant)) return doc
    // A rung is a variant file's sibling, never a variant in its own right.
    if (isLadderFilename(filename)) return doc
    // Renaming or re-editing metadata cannot change the bytes, so there is
    // nothing new to resize.
    if (previousDoc && previousDoc.filename === filename) return doc

    try {
      const result = await backfillAssetLadder({ id: doc.id as number, filename, variant }, io)
      for (const failure of result.failed) {
        req.payload.logger.error(
          `[width-ladder] ${filename} w${failure.width} was not written: ${failure.reason}`,
        )
      }
    } catch (error) {
      req.payload.logger.error(
        `[width-ladder] could not build rungs for ${filename}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }

    return doc
  }

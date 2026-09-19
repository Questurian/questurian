import type { CollectionAfterDeleteHook } from 'payload'

import {
  bunnyLadderIo,
  type LadderIo,
} from '@/features/media/pipeline/backfill-width-ladder'
import { WIDTH_LADDER, isLadderFilename, ladderFilename } from '@/features/media/pipeline/width-ladder'

/**
 * The other half of the rung obligation (issue #563).
 *
 * Rungs are files with no MediaAsset row, which is what keeps them off the
 * upload path and out of every query. The cost is that Payload's own delete
 * cannot see them: removing a variant asset takes the variant file with it and
 * leaves five orphans behind.
 *
 * That is not hypothetical. `regenerateVariantsForMediaSet` names each run
 * `{stem}-{mediaSetId}-{timestamp}_{variant}`, so a regeneration writes a whole
 * new set of filenames and deletes the previous assets -- thirty-five orphaned
 * rungs per MediaSet, every time, accumulating silently.
 *
 * Failures are logged rather than thrown, for the same reason as on the way in:
 * a leaked file costs a fraction of a cent, while a delete that refuses to
 * complete leaves a MediaSet half torn down.
 */
export const removeWidthLadder =
  (io: LadderIo = bunnyLadderIo): CollectionAfterDeleteHook =>
  async ({ doc, req }) => {
    const filename = typeof doc?.filename === 'string' ? doc.filename : null

    // Source uploads have no rungs, and a rung is never itself laddered.
    if (!filename || !doc?.variant || isLadderFilename(filename)) return doc

    for (const width of WIDTH_LADDER) {
      const rung = ladderFilename(filename, width)
      try {
        await io.remove(rung)
      } catch (error) {
        req.payload.logger.error(
          `[width-ladder] ${rung} was left behind: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }

    return doc
  }

/**
 * Backfill: write the small width rungs beside every published variant file.
 *
 * Add-only. It never updates a MediaAsset or a MediaSet, so it cannot repeat
 * the byte corruption that the last mass regeneration caused. Re-running it is
 * safe and cheap: rungs that already exist cost one HEAD each and no decode.
 *
 * This must finish before the reader-facing client starts asking for rungs —
 * a srcSet entry that 404s is a broken image, not a fallback.
 *
 * Reads the storage zone, not the database. The client asks for a rung because
 * it recognized a filename, so the set of files needing rungs is the set of
 * variant files on Bunny -- and reading that directly means this needs no
 * database connection, and cannot miss a file some other database knew about.
 *
 * Pass --from-db to scope the pass to MediaAsset rows instead.
 *
 * Usage:
 *   npx tsx scripts/backfill-width-ladder.ts --dry-run
 *   npx tsx scripts/backfill-width-ladder.ts
 */

import 'dotenv/config'
import {
  backfillWidthLadder,
  backfillZoneLadder,
} from '@/features/media/pipeline/backfill-width-ladder'

async function fromDatabase(dryRun: boolean, onProgress: Parameters<typeof backfillWidthLadder>[0]['onProgress']) {
  const { getPayload } = await import('payload')
  const { default: config } = await import('@/payload.config')
  return backfillWidthLadder({ payload: await getPayload({ config }), dryRun, onProgress })
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const fromDb = process.argv.includes('--from-db')

  console.log(dryRun ? 'DRY RUN - nothing will be written' : 'Writing rungs to Bunny')
  console.log(fromDb ? 'Source: MediaAsset rows' : 'Source: the Bunny media zone')

  const onProgress = (result: {
    filename: string
    written: number[]
    failed: Array<{ width: number }>
  }) => {
    if (result.written.length === 0 && result.failed.length === 0) return
    const written = result.written.length ? `+${result.written.join(',')}` : ''
    const failed = result.failed.length ? ` FAILED ${result.failed.map((f) => f.width).join(',')}` : ''
    console.log(`${result.filename} ${written}${failed}`)
  }

  const summary = fromDb
    ? await fromDatabase(dryRun, onProgress)
    : await backfillZoneLadder({ dryRun, onProgress })

  console.log(
    [
      `variant files visited: ${summary.assetsVisited}`,
      `skipped (not a variant): ${summary.assetsSkipped}`,
      `rungs written: ${summary.rungsWritten}`,
      `rungs already present: ${summary.rungsAlreadyPresent}`,
      `failures: ${summary.failures.length}`,
    ].join('\n'),
  )

  for (const failure of summary.failures) {
    console.error(`FAILED ${failure.filename} (asset ${failure.assetId}): ${failure.reason}`)
  }

  process.exit(summary.failures.length ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

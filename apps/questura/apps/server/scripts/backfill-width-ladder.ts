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
 * Usage:
 *   npx tsx scripts/backfill-width-ladder.ts --dry-run
 *   npx tsx scripts/backfill-width-ladder.ts
 */

import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { backfillWidthLadder } from '@/features/media/pipeline/backfill-width-ladder'

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const payload = await getPayload({ config })

  console.log(dryRun ? 'DRY RUN - nothing will be written' : 'Writing rungs to Bunny')

  const summary = await backfillWidthLadder({
    payload,
    dryRun,
    onProgress: (result) => {
      if (result.written.length === 0 && result.failed.length === 0) return
      const written = result.written.length ? `+${result.written.join(',')}` : ''
      const failed = result.failed.length ? ` FAILED ${result.failed.map((f) => f.width).join(',')}` : ''
      console.log(`${result.filename} ${written}${failed}`)
    },
  })

  console.log(
    [
      `assets visited: ${summary.assetsVisited}`,
      `skipped (no variant): ${summary.assetsSkipped}`,
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

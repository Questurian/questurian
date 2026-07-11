/**
 * Repair Script: Regenerate variants for specific MediaSets
 *
 * Re-runs the variant pipeline (crop + upload) for each MediaSet id given on
 * the command line. Used to repair sets whose variant files were corrupted by
 * the stale-buffer cloud-storage upload bug.
 *
 * Usage:
 *   npx tsx scripts/regenerate-media-sets.ts 1000 1001 1002
 */

import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { regenerateVariantsForMediaSet } from '@/features/media/pipeline/regenerate-variants'

async function main() {
  const ids = process.argv
    .slice(2)
    .flatMap((arg) => arg.split(','))
    .map((raw) => Number.parseInt(raw, 10))
    .filter((id) => Number.isFinite(id) && id > 0)

  if (ids.length === 0) {
    console.error('Usage: npx tsx scripts/regenerate-media-sets.ts <mediaSetId> [...ids]')
    process.exit(1)
  }

  const payload = await getPayload({ config })
  let done = 0
  const failed: number[] = []

  for (const id of ids) {
    try {
      const result = await regenerateVariantsForMediaSet({ payload, mediaSetId: id })
      done += 1
      console.log(`regenerated ${id}:`, JSON.stringify(result.variantAssetIds))
    } catch (error) {
      failed.push(id)
      console.error(`FAILED ${id}:`, error instanceof Error ? error.message : error)
    }
  }

  console.log(`done ${done}, failed ${failed.length}${failed.length ? `: ${failed.join(',')}` : ''}`)
  process.exit(failed.length ? 1 : 0)
}

main()

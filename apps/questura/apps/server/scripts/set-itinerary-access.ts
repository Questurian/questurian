/**
 * Bulk-set the Access tier on listicle itineraries.
 *
 * Why this is a script and not a migration
 * ----------------------------------------
 * It rewrites rows. The deploy preflight blocks `UPDATE` in a migration as a
 * data rewrite, and that guard is worth keeping: migrations add shape, and
 * changing what content costs is an editorial act that should be run
 * deliberately, read its own report, and be reversible in one command.
 *
 * What it does
 * ------------
 * Sets `access` to `member` (or back to `free`) on every published listicle
 * itinerary. Dry by default: it prints what it would change and exits without
 * writing. Pass `--apply` to commit.
 *
 *   pnpm tsx scripts/set-itinerary-access.ts                 # report only
 *   pnpm tsx scripts/set-itinerary-access.ts --apply         # lock them
 *   pnpm tsx scripts/set-itinerary-access.ts --tier free --apply   # undo
 *
 * Reversal is the same command with `--tier free`. Nothing here is one-way.
 *
 * Drafts are deliberately included: an unpublished itinerary that is later
 * published should already carry its tier, rather than going live free because
 * this ran before it existed as a published row.
 */
import { getPayload } from 'payload'

import config from '../src/payload.config'
import { ACCESS_TIERS, type AccessTier } from '../src/shared/content/accessTier'

type Args = { tier: AccessTier; apply: boolean }

function parseArgs(argv: string[]): Args {
  const apply = argv.includes('--apply')

  const tierIndex = argv.indexOf('--tier')
  const raw = tierIndex >= 0 ? argv[tierIndex + 1] : 'member'

  if (!(ACCESS_TIERS as readonly string[]).includes(raw ?? '')) {
    throw new Error(`--tier must be one of: ${ACCESS_TIERS.join(', ')}`)
  }

  return { tier: raw as AccessTier, apply }
}

async function main() {
  const { tier, apply } = parseArgs(process.argv.slice(2))
  const payload = await getPayload({ config })

  const all = await payload.find({
    collection: 'listicle-itineraries',
    limit: 0,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })

  const docs = all.docs as unknown as Array<{
    id: number | string
    title?: string
    status?: string
    access?: string
  }>

  const changing = docs.filter((doc) => doc.access !== tier)

  console.log(`listicle itineraries: ${docs.length}`)
  console.log(`already ${tier}:       ${docs.length - changing.length}`)
  console.log(`to change:            ${changing.length}`)
  console.log('')

  for (const doc of changing) {
    console.log(`  ${doc.status ?? '?'}  ${String(doc.id).padStart(5)}  ${doc.access ?? '?'} -> ${tier}  ${doc.title ?? ''}`)
  }

  if (!apply) {
    console.log('')
    console.log('Dry run. Nothing was written. Re-run with --apply to commit.')
    return
  }

  let updated = 0
  let failed = 0

  for (const doc of changing) {
    try {
      await payload.update({
        collection: 'listicle-itineraries',
        id: doc.id,
        data: { access: tier },
        overrideAccess: true,
        // Collection hooks revalidate public paths and enforce reference locks.
        // Both are wanted here: a tier change must reach the cached pages, and
        // nothing about this should bypass a guard that protects content.
      })
      updated += 1
    } catch (error) {
      failed += 1
      const message = error instanceof Error ? error.message : String(error)
      console.error(`  FAILED ${doc.id}: ${message}`)
    }
  }

  console.log('')
  console.log(`updated: ${updated}`)
  console.log(`failed:  ${failed}`)

  if (failed > 0) process.exitCode = 1
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })

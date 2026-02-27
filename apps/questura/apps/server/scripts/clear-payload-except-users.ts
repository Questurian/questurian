/**
 * Clear all Payload CMS collections except the users collection.
 *
 * Usage:
 *   pnpm clear:payload:except-users
 *
 * Optional:
 *   pnpm clear:payload:except-users -- --dry-run
 */

import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../src/payload.config'

const args = new Set(process.argv.slice(2))
const isDryRun = args.has('--dry-run')
const MAX_PASSES = 8
const BATCH_LIMIT = 200

interface CollectionTotals {
  deleted: number
  remaining: number
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

async function countDocs(payload: any, collection: string): Promise<number> {
  const result = await payload.find({
    collection: collection as any,
    limit: 1,
    depth: 0,
  })
  return result.totalDocs ?? 0
}

async function clearCollectionPass(payload: any, collection: string): Promise<number> {
  let deletedInCollection = 0

  while (true) {
    const result = await payload.find({
      collection: collection as any,
      limit: BATCH_LIMIT,
      page: 1,
      depth: 0,
    })

    if (!result.docs.length) {
      return deletedInCollection
    }

    let deletedInBatch = 0

    for (const doc of result.docs as Array<{ id: string | number }>) {
      try {
        await payload.delete({
          collection: collection as any,
          id: doc.id,
        })
        deletedInBatch++
      } catch {
        // Expected for dependency-protected docs; retry on later pass.
      }
    }

    deletedInCollection += deletedInBatch

    if (deletedInBatch === 0) {
      return deletedInCollection
    }
  }
}

async function main() {
  const resolvedConfig = await config
  const userCollection =
    typeof resolvedConfig.admin?.user === 'string' ? resolvedConfig.admin.user : 'users'

  const allCollections = (resolvedConfig.collections ?? [])
    .map((collection) => collection.slug)
    .filter((slug): slug is string => typeof slug === 'string')

  const targetCollections = allCollections.filter((slug) => slug !== userCollection)

  if (targetCollections.length === 0) {
    console.log('No collections to clear.')
    process.exit(0)
  }

  console.log(
    `🧹 Clearing Payload data${isDryRun ? ' (dry run)' : ''} - preserving "${userCollection}" only`
  )
  console.log(`📦 Target collections (${targetCollections.length}): ${targetCollections.join(', ')}`)

  const payload = await getPayload({ config: resolvedConfig })

  const totals = new Map<string, CollectionTotals>()
  for (const collection of targetCollections) {
    totals.set(collection, { deleted: 0, remaining: 0 })
  }

  if (isDryRun) {
    for (const collection of targetCollections) {
      const totalDocs = await countDocs(payload, collection)
      console.log(`🧪 ${collection}: ${totalDocs} docs`)
      totals.set(collection, { deleted: 0, remaining: totalDocs })
    }
  } else {
    for (let pass = 1; pass <= MAX_PASSES; pass++) {
      let deletedThisPass = 0
      console.log(`\n🔁 Pass ${pass}/${MAX_PASSES}`)

      for (const collection of targetCollections) {
        const deleted = await clearCollectionPass(payload, collection)
        if (deleted > 0) {
          const current = totals.get(collection)
          if (current) current.deleted += deleted
          deletedThisPass += deleted
          console.log(`  ✅ ${collection}: deleted ${deleted}`)
        }
      }

      if (deletedThisPass === 0) {
        console.log('  ℹ️  No more progress in this pass.')
        break
      }
    }

    for (const collection of targetCollections) {
      const remaining = await countDocs(payload, collection)
      const current = totals.get(collection)
      if (current) current.remaining = remaining
    }
  }

  const usersCount = await countDocs(payload, userCollection)
  let unresolvedCollections = 0

  console.log('\n📊 Summary')
  for (const collection of targetCollections) {
    const stats = totals.get(collection) || { deleted: 0, remaining: 0 }
    const marker = stats.remaining === 0 ? '✅' : '⚠️'
    console.log(
      `${marker} ${collection.padEnd(24)} deleted=${String(stats.deleted).padStart(4)} remaining=${String(stats.remaining).padStart(4)}`
    )
    if (stats.remaining > 0) unresolvedCollections++
  }

  console.log(`\n👤 Preserved ${userCollection}: ${usersCount} docs`)

  if (unresolvedCollections > 0) {
    console.error(
      `\n❌ ${unresolvedCollections} collection(s) still have data. Re-run the command to continue cleanup.`
    )
    process.exit(1)
  }

  console.log('\n✅ Payload cleanup complete (users preserved).')
  process.exit(0)
}

main().catch((error) => {
  console.error('❌ Cleanup failed:', normalizeErrorMessage(error))
  process.exit(1)
})

/**
 * Clear Test Collections Script
 *
 * Clears specific collections for testing API calls AND all caches.
 * Collections cleared:
 * - media-assets
 * - accommodations
 * - dining
 * - attractions
 * - nightlife
 * - locations
 *
 * Cache layers cleared:
 * 1. Database records (via Payload API)
 * 2. Bunny.net CDN cache (via Bunny API purge)
 * 3. Next.js build cache (.next folder)
 *
 * Usage:
 *   pnpm clear:test
 */

import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../src/payload.config'
import fs from 'fs'
import path from 'path'

// Collections to clear - order matters! (delete dependents before dependencies)
// Users collection is intentionally excluded to preserve user accounts
const COLLECTIONS_TO_CLEAR = [
  // Clear content collections first (they reference media and locations)
  'articles',
  'instagram-posts',
  'seo-metadata',

  // Clear data collections (they also reference media and locations)
  'accommodations',
  'dining',
  'attractions',
  'nightlife',
  'affiliate-products',

  // Clear taxonomy collections
  'article-categories',
  'article-tags',
  'perfect-for-tags',

  // Clear locations (after everything that references them)
  'locations',

  // Finally clear media assets (after everything that references them)
  'media-assets',
] as const

/**
 * Clear Next.js build cache
 */
async function clearNextCache() {
  console.log('\n🗑️  Clearing Next.js build cache...')
  const nextCachePath = path.resolve(process.cwd(), '.next')

  try {
    if (fs.existsSync(nextCachePath)) {
      fs.rmSync(nextCachePath, { recursive: true, force: true })
      console.log('✅ Next.js .next folder cleared')
    } else {
      console.log('ℹ️  No .next folder found (already clean)')
    }
  } catch (error) {
    console.error('❌ Error clearing Next.js cache:', error)
  }
}

/**
 * Purge Bunny.net CDN cache
 *
 * NOTE: This requires the BUNNY_CDN_API_KEY (account-level API key), not the storage API key.
 * If you don't have this key, you can:
 * 1. Get it from bunny.net dashboard > Account Settings > API
 * 2. Add it to .env as BUNNY_CDN_API_KEY
 * 3. Or skip this step - the script will still clear database and Next.js cache
 */
async function purgeBunnyCDNCache() {
  // Try CDN API key first, fallback to storage key (may not work)
  const apiKey = process.env.BUNNY_CDN_API_KEY || process.env.BUNNY_STORAGE_API_KEY
  const hostname = process.env.BUNNY_STORAGE_HOSTNAME

  if (!apiKey || !hostname) {
    console.log('⚠️  Bunny.net credentials not found - skipping CDN cache purge')
    console.log('   Set BUNNY_CDN_API_KEY in .env to enable cache purging')
    return
  }

  console.log('\n🐰 Purging Bunny.net CDN cache...')

  try {
    // Bunny.net CDN Purge API with wildcard to purge all files
    // Documentation: https://docs.bunny.net/reference/purgepublic_indexpost
    const purgeUrl = `https://${hostname}/*`
    const response = await fetch(
      `https://api.bunny.net/purge?url=${encodeURIComponent(purgeUrl)}&async=false`,
      {
        method: 'POST',
        headers: {
          'AccessKey': apiKey,
        },
      }
    )

    if (response.ok) {
      console.log('✅ Bunny.net CDN cache purged successfully')
      console.log(`   Purged: ${purgeUrl}`)
    } else {
      const errorText = await response.text()
      console.warn('⚠️  CDN cache purge failed (continuing anyway):', response.status)
      console.warn('   This is usually because BUNNY_STORAGE_API_KEY lacks purge permissions')
      console.warn('   Add BUNNY_CDN_API_KEY to .env for proper cache purging')
      console.warn('   Error:', errorText)
    }
  } catch (error) {
    console.warn('⚠️  Error purging Bunny.net CDN (continuing anyway):', error)
  }
}

async function clearTestCollections() {
  console.log('🧹 Starting comprehensive cache and database cleanup...\n')
  console.log('=' + '='.repeat(60))

  try {
    // Step 1: Clear Next.js build cache FIRST
    await clearNextCache()

    // Step 2: Purge Bunny.net CDN cache
    await purgeBunnyCDNCache()

    // Step 3: Clear database records
    console.log('\n📦 Clearing database collections...')
    const payload = await getPayload({ config })

    const summary: Record<string, { deleted: number; failed: number }> = {}

    for (const collectionSlug of COLLECTIONS_TO_CLEAR) {
      console.log(`\n📂 Processing collection: ${collectionSlug}`)
      console.log('─'.repeat(60))

      try {
        // Fetch all documents in the collection
        const result = await payload.find({
          collection: collectionSlug,
          limit: 10000, // High limit to get all documents
          depth: 0, // Don't populate relationships for performance
        })

        if (result.docs.length === 0) {
          console.log(`✅ Collection "${collectionSlug}" is already empty`)
          summary[collectionSlug] = { deleted: 0, failed: 0 }
          continue
        }

        console.log(`Found ${result.docs.length} documents to delete\n`)

        let deleted = 0
        const errors: Array<{ id: string | number; error: string }> = []

        // Delete each document
        for (const doc of result.docs) {
          try {
            await payload.delete({
              collection: collectionSlug,
              id: doc.id,
            })

            deleted++
            // Show progress every 10 deletions
            if (deleted % 10 === 0) {
              console.log(`  🗑️  Deleted ${deleted}/${result.docs.length} documents...`)
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            console.error(`  ❌ Failed to delete document ${doc.id}:`, errorMessage)
            errors.push({
              id: doc.id,
              error: errorMessage,
            })
          }
        }

        summary[collectionSlug] = {
          deleted,
          failed: errors.length,
        }

        console.log(`\n✅ Deleted ${deleted} documents from "${collectionSlug}"`)
        if (errors.length > 0) {
          console.log(`⚠️  Failed to delete ${errors.length} documents`)
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`❌ Error processing collection "${collectionSlug}":`, errorMessage)
        summary[collectionSlug] = { deleted: 0, failed: -1 }
      }
    }

    // Final summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 Cleanup Summary:')
    console.log('='.repeat(60))

    let totalDeleted = 0
    let totalFailed = 0
    let hasErrors = false

    for (const [collection, stats] of Object.entries(summary)) {
      const status = stats.failed === -1 ? '❌ ERROR' : stats.failed > 0 ? '⚠️ ' : '✅'
      console.log(`${status} ${collection.padEnd(20)} | Deleted: ${stats.deleted.toString().padStart(4)} | Failed: ${stats.failed.toString().padStart(4)}`)

      if (stats.failed !== -1) {
        totalDeleted += stats.deleted
        totalFailed += stats.failed
      } else {
        hasErrors = true
      }
    }

    console.log('─'.repeat(60))
    console.log(`Total:                      | Deleted: ${totalDeleted.toString().padStart(4)} | Failed: ${totalFailed.toString().padStart(4)}`)

    if (hasErrors || totalFailed > 0) {
      console.log('\n⚠️  Some operations failed. Check the logs above for details.')
      process.exit(1)
    }

    console.log('\n✅ Complete cleanup finished!')
    console.log('   - Next.js cache cleared')
    console.log('   - Bunny.net CDN cache purged')
    console.log('   - Database collections cleared')
    console.log('\n💡 Tip: Restart dev server (pnpm dev) to ensure fresh cache')
    process.exit(0)
  } catch (error) {
    console.error('\n❌ Fatal error during cleanup:', error)
    process.exit(1)
  }
}

clearTestCollections()

/**
 * Cleanup Script: Backfill author Field for Rankings
 *
 * This script assigns an author user to all rankings that are missing this field.
 * It will assign rankings to the first admin user found in the database.
 *
 * Usage:
 *   npx tsx scripts/backfill-rankings-created-by.ts
 */

import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@/payload.config'

async function backfillRankingsCreatedBy() {
  console.log('🛡️ Starting rankings author backfill...\n')

  try {
    const payload = await getPayload({ config })

    // Find all rankings without author
    const rankingsWithoutCreator = await payload.find({
      collection: 'rankings',
      where: {
        author: { exists: false }
      },
      limit: 1000
    })

    if (rankingsWithoutCreator.docs.length === 0) {
      console.log('✅ No rankings found without author - all done!')
      process.exit(0)
    }

    console.log(`Found ${rankingsWithoutCreator.docs.length} rankings without author\n`)

    // Get first admin user to assign as fallback creator
    const adminUser = await payload.find({
      collection: 'users',
      where: { role: { equals: 'admin' } },
      limit: 1
    })

    if (!adminUser.docs[0]) {
      console.error('❌ No admin user found in database to assign rankings to')
      console.error('   Please create an admin user first, then re-run this script')
      process.exit(1)
    }

    const fallbackCreator = adminUser.docs[0]
    console.log(`📌 Using admin user as fallback creator: ${fallbackCreator.email} (ID: ${fallbackCreator.id})\n`)

    let updated = 0
    const errors: Array<{ title: string; id: string; error: string }> = []

    for (const ranking of rankingsWithoutCreator.docs) {
      try {
        await payload.update({
          collection: 'rankings',
          id: ranking.id,
          data: {
            author: fallbackCreator.id
          }
        })

        console.log(`🔧 Updated: "${ranking.title}" (ID: ${ranking.id})`)
        updated++
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`❌ Failed to update "${ranking.title}":`, errorMessage)
        errors.push({
          title: ranking.title,
          id: ranking.id,
          error: errorMessage
        })
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 Backfill Summary:')
    console.log('='.repeat(60))
    console.log(`✅ Updated: ${updated}`)
    console.log(`❌ Failed: ${errors.length}`)

    if (errors.length > 0) {
      console.log('\n⚠️ Errors:')
      errors.forEach(({ title, id, error }) => {
        console.log(`   - "${title}" (${id}): ${error}`)
      })
      process.exit(1)
    }

    console.log('\n✅ Rankings author backfill complete!')
    process.exit(0)
  } catch (error) {
    console.error('❌ Fatal error during backfill:', error)
    process.exit(1)
  }
}

backfillRankingsCreatedBy()

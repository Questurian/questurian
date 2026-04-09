import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'

async function clearAttractions() {
  console.log('🗑️  Clearing attractions collection...\n')

  try {
    const payload = await getPayload({ config })
    const allAttractions = await payload.find({
      collection: 'attractions',
      limit: 10000,
      depth: 0,
      overrideAccess: true,
    })

    let deleted = 0

    for (const doc of allAttractions.docs) {
      try {
        await payload.delete({
          collection: 'attractions',
          id: doc.id,
          overrideAccess: true,
        })
        deleted++
        console.log(`✓ Deleted ${deleted}/${allAttractions.docs.length}`)
      } catch (error) {
        console.error(`✗ Error deleting ${doc.id}:`, error)
      }
    }

    console.log(`\n✅ Deleted ${deleted} attractions`)
    process.exit(0)
  } catch (error) {
    console.error('❌ Failed to clear attractions:', error)
    process.exit(1)
  }
}

clearAttractions()

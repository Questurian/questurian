import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../../../payload.config'

async function clearLocations() {
  console.log('🗑️  Clearing locations table...\n')

  try {
    const payload = await getPayload({ config })

    // Get all locations
    const allLocations = await payload.find({
      collection: 'locations',
      limit: 10000,
      depth: 0,
    })

    let deleted = 0

    // Delete each location
    for (const doc of allLocations.docs) {
      try {
        await payload.delete({
          collection: 'locations',
          id: doc.id,
        })
        deleted++
        console.log(`✓ Deleted ${deleted}/${allLocations.docs.length}`)
      } catch (error) {
        console.error(`✗ Error deleting ${doc.id}:`, error)
      }
    }

    console.log(`\n✅ Deleted ${deleted} locations`)
    process.exit(0)
  } catch (error) {
    console.error('❌ Failed to clear locations:', error)
    process.exit(1)
  }
}

clearLocations()

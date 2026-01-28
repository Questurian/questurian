import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'

/**
 * Migration script to convert durationMinutes from number to string
 * in all itinerary items (accommodations, attractions, dining, nightlife blocks)
 */
async function migrateDurationMinutes() {
  const payload = await getPayload({ config: await config })

  console.log('Starting migration: durationMinutes number → string')

  try {
    // Fetch all itineraries
    const itineraries = await payload.find({
      collection: 'itineraries',
      limit: 1000,
      pagination: false,
    })

    console.log(`Found ${itineraries.docs.length} itineraries`)

    let updateCount = 0

    for (const itinerary of itineraries.docs) {
      if (!itinerary.items || !Array.isArray(itinerary.items)) continue

      let needsUpdate = false
      const updatedItems = itinerary.items.map((item: any) => {
        // Check if this item has durationMinutes as a number
        if (
          typeof item.durationMinutes === 'number' &&
          ['itinerary-accommodations', 'itinerary-attractions', 'itinerary-dining', 'itinerary-nightlife'].includes(item.blockType)
        ) {
          needsUpdate = true
          return {
            ...item,
            durationMinutes: item.durationMinutes.toString(),
          }
        }
        return item
      })

      if (needsUpdate) {
        await payload.update({
          collection: 'itineraries',
          id: itinerary.id,
          data: {
            items: updatedItems,
          },
        })
        updateCount++
        console.log(`✓ Updated itinerary: ${itinerary.id} (${itinerary.title})`)
      }
    }

    console.log(`\nMigration complete!`)
    console.log(`Updated ${updateCount} itineraries`)

  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }

  process.exit(0)
}

migrateDurationMinutes()

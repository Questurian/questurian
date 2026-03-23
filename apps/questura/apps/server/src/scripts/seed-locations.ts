import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'
import { seedLocations, SEED_LOCATION_KEYS } from '../features/location/seed'

const payload = await getPayload({ config })

try {
  // Remove any locations NOT in the seed list and not referenced by other docs
  console.log('Removing stale locations not in seed list...')
  let removed = 0
  let skipped = 0

  for (const level of ['neighborhood', 'city', 'country'] as const) {
    const result = await payload.find({
      collection: 'locations',
      where: { level: { equals: level } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    } as any)

    for (const doc of result.docs as Array<{ id: string | number; locationKey?: string }>) {
      if (SEED_LOCATION_KEYS.has(doc.locationKey ?? '')) continue
      try {
        await payload.delete({ collection: 'locations', id: doc.id, overrideAccess: true } as any)
        console.log(`  ✓ Removed stale: ${doc.locationKey}`)
        removed++
      } catch {
        console.log(`  ↺ Kept (referenced): ${doc.locationKey}`)
        skipped++
      }
    }
  }

  console.log(`  Removed ${removed}, kept ${skipped} referenced\n`)

  await seedLocations(payload)
  process.exit(0)
} catch (error) {
  console.error('Location seeding failed:', error)
  process.exit(1)
}

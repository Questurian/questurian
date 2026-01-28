import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../../../payload.config'
import { LOCATION_REFERENCE_TARGETS } from '../../../shared/location/server/references'

const MAX_DOCS = 10000

const buildLocationMap = async (payload: Awaited<ReturnType<typeof getPayload>>) => {
  const locations = await payload.find({
    collection: 'locations',
    limit: MAX_DOCS,
    depth: 0,
    overrideAccess: true,
  })

  const map = new Map<string, string | number>()

  for (const doc of locations.docs) {
    if (doc.locationKey) {
      map.set(doc.locationKey, doc.id)
    }
  }

  return map
}

const backfillLocationRefs = async () => {
  console.log('Starting locationRef backfill...')

  const payload = await getPayload({ config })
  const locationMap = await buildLocationMap(payload)

  for (const target of LOCATION_REFERENCE_TARGETS) {
    const result = await payload.find({
      collection: target.slug,
      limit: MAX_DOCS,
      depth: 0,
      overrideAccess: true,
    })

    let updated = 0
    let skipped = 0
    let missing = 0

    for (const doc of result.docs) {
      const locationKey = typeof doc.location === 'string' ? doc.location : ''
      const locationRef = doc.locationRef

      if (!locationKey) {
        skipped += 1
        continue
      }

      if (locationRef) {
        skipped += 1
        continue
      }

      const locationId = locationMap.get(locationKey)

      if (!locationId) {
        missing += 1
        console.warn(
          `Missing location for ${target.slug} ${doc.id}: location="${locationKey}"`
        )
        continue
      }

      await payload.update({
        collection: target.slug,
        id: doc.id,
        data: {
          locationRef: locationId,
        },
        overrideAccess: true,
      })

      updated += 1
    }

    console.log(
      `${target.slug}: updated=${updated}, skipped=${skipped}, missing=${missing}`
    )
  }

  console.log('LocationRef backfill complete.')
  process.exit(0)
}

backfillLocationRefs().catch((error) => {
  console.error('LocationRef backfill failed:', error)
  process.exit(1)
})

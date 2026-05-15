import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'

async function clearHomepageBlocks() {
  console.log('Clearing all location-homepage page blocks...\n')

  const payload = await getPayload({ config })

  const result = await payload.find({
    collection: 'location-homepages',
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })

  if (result.totalDocs === 0) {
    console.log('No location-homepages found.')
    process.exit(0)
  }

  console.log(`Found ${result.totalDocs} homepage(s). Clearing blocks...\n`)

  let cleared = 0

  for (const doc of result.docs) {
    const blockCount = Array.isArray(doc.pageBlocks) ? doc.pageBlocks.length : 0

    await payload.update({
      collection: 'location-homepages',
      id: doc.id,
      data: { pageBlocks: [] },
      overrideAccess: true,
    })

    cleared++
    console.log(`✓ [${cleared}/${result.totalDocs}] Homepage ${doc.id} — cleared ${blockCount} block(s)`)
  }

  console.log(`\nDone. ${cleared} homepage(s) cleared.`)
  process.exit(0)
}

clearHomepageBlocks().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})

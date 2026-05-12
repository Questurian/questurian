import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'

// All neighborhood-scope articles already received a category in the earlier
// publish-all-drafts run, but the canonicalPath remained null because
// buildCanonicalPath used to refuse 3-segment locations. Now that the helper
// flattens neighborhood → city for URL purposes, touching these articles
// fills in canonicalPath under the new rule.
const TOUCH_IDS = [16, 18, 26, 27, 28]

const payload = await getPayload({ config })

try {
  console.log('=== Recomputing canonicalPath for neighborhood-scope articles ===')
  for (const id of TOUCH_IDS) {
    try {
      const doc = (await payload.update({
        collection: 'articles',
        id,
        data: {},
        overrideAccess: true,
      })) as unknown as {
        id: number | string
        slug?: string
        location?: string
        canonicalPath?: string | null
      }
      console.log(
        `  ✓ id=${doc.id} loc=${doc.location} canonicalPath=${doc.canonicalPath ?? '(null)'}`,
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  ✗ id=${id} failed: ${msg}`)
    }
  }
  process.exit(0)
} catch (error) {
  console.error('backfill-neighborhood-canonical failed:', error)
  process.exit(1)
}

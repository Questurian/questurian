import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'

// id 24 is currently published with no category; assign News before recompute.
const ENSURE_CATEGORY: Array<{ id: number; category: string }> = [
  { id: 24, category: 'News' },
]

// These four are the country-scope (location='peru') published articles whose
// canonicalPath needs to be recomputed under the new buildCanonicalPath rule.
const TOUCH_IDS = [21, 22, 24, 33]

const payload = await getPayload({ config })

try {
  const newsCat = await payload.find({
    collection: 'article-categories',
    where: { name: { equals: 'News' } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const categoryByName = new Map<string, number | string>()
  if (newsCat.docs[0]) {
    const doc = newsCat.docs[0] as unknown as { id: number | string }
    categoryByName.set('News', doc.id)
  }

  for (const ec of ENSURE_CATEGORY) {
    const catId = categoryByName.get(ec.category)
    if (catId === undefined) {
      console.error(`Missing category ${ec.category}`)
      continue
    }
    const before = (await payload.findByID({
      collection: 'articles',
      id: ec.id,
      depth: 0,
      overrideAccess: true,
    })) as unknown as { category?: unknown }
    if (!before.category) {
      await payload.update({
        collection: 'articles',
        id: ec.id,
        data: { category: catId },
        overrideAccess: true,
      })
      console.log(`  ✓ id=${ec.id} category assigned: ${ec.category}`)
    } else {
      console.log(`  - id=${ec.id} already has a category`)
    }
  }

  console.log('\n=== Touching country-scope articles to recompute canonicalPath ===')
  for (const id of TOUCH_IDS) {
    try {
      const doc = (await payload.update({
        collection: 'articles',
        id,
        data: {}, // no-op update; beforeChange recomputes canonicalPath
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
  console.error('recompute-country-canonical failed:', error)
  process.exit(1)
}

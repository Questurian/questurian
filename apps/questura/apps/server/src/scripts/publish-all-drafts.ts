import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'

const CATEGORIES = ['Guides', 'Food', 'Neighborhoods', 'Safety', 'News'] as const

// Every current draft, grouped by intended category.
// Country-scope (peru) and neighborhood-scope (peru|lima|barranco, etc.) don't
// produce a canonicalPath under the new URL system; we still assign a category
// for editorial completeness.
type Assignment = { id: number; category: string }
const ASSIGNMENTS: Assignment[] = [
  // peru|lima (city) — gets canonicalPath
  { id: 17, category: 'Neighborhoods' },

  // peru|lima|<neighborhood> — published but no canonicalPath
  { id: 16, category: 'Neighborhoods' },
  { id: 18, category: 'Safety' },
  { id: 26, category: 'Neighborhoods' },
  { id: 27, category: 'Neighborhoods' },
  { id: 28, category: 'Neighborhoods' },

  // peru (country) — keeps legacy /peru/articles/[slug]
  { id: 21, category: 'Safety' },
  { id: 22, category: 'Guides' },
  { id: 33, category: 'Guides' },

  // colombia|medellin (city) — gets canonicalPath
  { id: 29, category: 'Neighborhoods' },
  { id: 31, category: 'Neighborhoods' },
  { id: 32, category: 'Guides' },
]

const payload = await getPayload({ config })

try {
  console.log('\n=== Ensuring categories exist ===')
  const categoryIdByName = new Map<string, number | string>()
  for (const name of CATEGORIES) {
    const existing = await payload.find({
      collection: 'article-categories',
      where: { name: { equals: name } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (existing.docs.length > 0) {
      const doc = existing.docs[0] as unknown as { id: number | string; slug?: string }
      categoryIdByName.set(name, doc.id)
      console.log(`  - ${name} ok (id=${doc.id}, slug=${doc.slug})`)
    } else {
      const created = (await payload.create({
        collection: 'article-categories',
        data: { name, status: 'active', usageCount: 0 },
        overrideAccess: true,
      })) as unknown as { id: number | string; slug?: string }
      categoryIdByName.set(name, created.id)
      console.log(`  ✓ Created ${name} (id=${created.id}, slug=${created.slug})`)
    }
  }

  console.log('\n=== Assigning category + publishing each draft ===')
  let successes = 0
  let failures = 0
  for (const a of ASSIGNMENTS) {
    const categoryId = categoryIdByName.get(a.category)
    if (categoryId === undefined) {
      console.error(`  ✗ id=${a.id}: unknown category ${a.category}`)
      failures++
      continue
    }
    try {
      const updated = (await payload.update({
        collection: 'articles',
        id: a.id,
        data: { category: categoryId, status: 'published' },
        overrideAccess: true,
      })) as unknown as {
        id: number | string
        slug?: string
        status?: string
        location?: string
        canonicalPath?: string | null
      }
      const url =
        updated.canonicalPath ??
        (() => {
          const loc = updated.location ?? ''
          const parts = loc.split('|').filter(Boolean)
          if (parts.length === 1) return `/${parts[0]}/articles/${updated.slug}`
          if (parts.length >= 2) return `(no public URL — neighborhood scope: ${loc})`
          return '(no public URL)'
        })()
      console.log(`  ✓ id=${updated.id}  ${updated.status}  ${url}`)
      successes++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  ✗ id=${a.id} failed: ${msg}`)
      failures++
    }
  }

  console.log(`\n=== Result: ${successes} published, ${failures} failed ===`)

  console.log('\n=== All published articles ===')
  const result = await payload.find({
    collection: 'articles',
    where: { status: { equals: 'published' } },
    limit: 100,
    depth: 0,
    sort: 'id',
    overrideAccess: true,
  })
  for (const doc of result.docs as unknown as Array<{
    id: number | string
    slug?: string
    location?: string
    canonicalPath?: string | null
  }>) {
    console.log(
      `  id=${doc.id} loc=${doc.location} canonicalPath=${doc.canonicalPath ?? '(null)'}`,
    )
  }

  process.exit(failures > 0 ? 1 : 0)
} catch (error) {
  console.error('publish-all-drafts failed:', error)
  process.exit(1)
}

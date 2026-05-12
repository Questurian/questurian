import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'

const CATEGORIES = ['Guides', 'Food', 'Neighborhoods', 'Safety'] as const

type Assignment = { id: number; category: string; publish: boolean }
const ASSIGNMENTS: Assignment[] = [
  { id: 19, category: 'Guides',        publish: false },
  { id: 20, category: 'Guides',        publish: true  },
  { id: 23, category: 'Guides',        publish: true  },
  { id: 25, category: 'Neighborhoods', publish: true  },
  { id: 30, category: 'Food',          publish: true  },
]

const payload = await getPayload({ config })

try {
  console.log('\n=== Upserting categories ===')
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
      console.log(`  - ${name} already exists (id=${doc.id}, slug=${doc.slug})`)
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

  console.log('\n=== Assigning categories + publishing ===')
  for (const a of ASSIGNMENTS) {
    const categoryId = categoryIdByName.get(a.category)
    if (categoryId === undefined) {
      console.error(`  ✗ id=${a.id}: unknown category ${a.category}`)
      continue
    }
    const data: Record<string, unknown> = { category: categoryId }
    if (a.publish) data.status = 'published'

    try {
      const updated = (await payload.update({
        collection: 'articles',
        id: a.id,
        data,
        overrideAccess: true,
      })) as unknown as {
        id: number | string
        slug?: string
        status?: string
        canonicalPath?: string | null
      }
      console.log(
        `  ✓ id=${updated.id} slug=${updated.slug} status=${updated.status} canonicalPath=${updated.canonicalPath ?? '(null)'}`,
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  ✗ id=${a.id} failed: ${msg}`)
    }
  }

  console.log('\n=== Final state of city-scope Lima published articles ===')
  const result = await payload.find({
    collection: 'articles',
    where: {
      and: [
        { status: { equals: 'published' } },
        { location: { equals: 'peru|lima' } },
      ],
    },
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })
  for (const doc of result.docs as unknown as Array<{
    id: number | string
    slug?: string
    canonicalPath?: string | null
  }>) {
    console.log(`  id=${doc.id} slug=${doc.slug} canonicalPath=${doc.canonicalPath ?? '(null)'}`)
  }

  process.exit(0)
} catch (error) {
  console.error('wire-category-urls failed:', error)
  process.exit(1)
}

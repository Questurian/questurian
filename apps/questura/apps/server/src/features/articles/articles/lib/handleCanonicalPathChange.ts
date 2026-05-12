import type { PayloadRequest } from 'payload'
import { buildCanonicalPath, resolveCategorySlug } from './canonicalPath'

type AnyDoc = Record<string, unknown>

type HandleArgs = {
  data: AnyDoc
  originalDoc: AnyDoc | undefined
  req: PayloadRequest
}

/**
 * Compute the article's canonical path, set it on `data`, and write any
 * required redirect rows when a *published* article's URL-affecting fields
 * (location, category, slug) change.
 *
 * Mutates `data.canonicalPath`. Returns nothing.
 */
export async function handleCanonicalPathChange({
  data,
  originalDoc,
  req,
}: HandleArgs): Promise<void> {
  const payload = req.payload

  const previousCategorySlug = await resolveCategorySlug(payload, originalDoc?.category)
  const nextCategorySlug = await resolveCategorySlug(
    payload,
    data.category ?? originalDoc?.category,
  )

  const oldPath = buildCanonicalPath({
    location: stringOrNull(originalDoc?.location),
    categorySlug: previousCategorySlug,
    slug: stringOrNull(originalDoc?.slug),
    status: stringOrNull(originalDoc?.status),
  })

  const newPath = buildCanonicalPath({
    location: stringOrNull(data.location ?? originalDoc?.location),
    categorySlug: nextCategorySlug,
    slug: stringOrNull(data.slug ?? originalDoc?.slug),
    status: stringOrNull(data.status ?? originalDoc?.status),
  })

  data.canonicalPath = newPath

  const wasPublished = stringOrNull(originalDoc?.status) === 'published'
  if (!wasPublished || !oldPath || !newPath || oldPath === newPath) return

  const articleId = ((): number | string | null => {
    const id = originalDoc?.id
    if (typeof id === 'number' || typeof id === 'string') return id
    return null
  })()

  // 1. Upsert redirect: oldPath -> newPath
  const existing = await payload.find({
    collection: 'article-redirects',
    where: { oldPath: { equals: oldPath } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  if (existing.totalDocs > 0) {
    const row = existing.docs[0] as unknown as { id: string | number }
    await payload.update({
      collection: 'article-redirects',
      id: row.id,
      data: {
        newPath,
        article: articleId as number | null,
        source: 'article-url-change',
        statusCode: '301',
      },
      overrideAccess: true,
    })
  } else {
    await payload.create({
      collection: 'article-redirects',
      data: {
        oldPath,
        newPath,
        article: articleId as number | null,
        source: 'article-url-change',
        statusCode: '301',
      },
      overrideAccess: true,
    })
  }

  // 2. Flatten chains — any redirect already pointing at oldPath should now
  // point at the new canonical path.
  const chained = await payload.find({
    collection: 'article-redirects',
    where: { newPath: { equals: oldPath } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  for (const doc of chained.docs) {
    const row = doc as unknown as { id: string | number; oldPath?: string }
    if (row.oldPath === newPath) continue
    await payload.update({
      collection: 'article-redirects',
      id: row.id,
      data: { newPath },
      overrideAccess: true,
    })
  }

  // 3. If a redirect with oldPath === newPath exists (article moved back to a
  // path that was previously a redirect source), delete it — newPath is now a
  // live article URL.
  const selfRef = await payload.find({
    collection: 'article-redirects',
    where: { oldPath: { equals: newPath } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  for (const doc of selfRef.docs) {
    const row = doc as unknown as { id: string | number }
    await payload.delete({
      collection: 'article-redirects',
      id: row.id,
      overrideAccess: true,
    })
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

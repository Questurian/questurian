import type { Payload } from 'payload'

type CanonicalPathInputs = {
  location: string | null | undefined
  categorySlug: string | null | undefined
  slug: string | null | undefined
  status: string | null | undefined
}

/**
 * Build the public canonical URL for a standard article.
 *
 * Published articles with a category get a canonical path:
 *   - country scope     (1 segment, e.g. `peru`)              → /${country}/${categorySlug}/${slug}
 *   - city scope        (2 segments, e.g. `peru|lima`)        → /${country}/${city}/${categorySlug}/${slug}
 *   - neighborhood scope (3 segments, e.g. `peru|lima|barranco`)
 *       The neighborhood is preserved on the article's `location` field for
 *       filtering, but the public URL is flattened to city scope. Slug is
 *       globally unique on Articles so no collision is possible.
 *
 * Drafts and global scope return null. Uniqueness across category vs.
 * city/country slugs is enforced at write time on Categories/Locations.
 */
export function buildCanonicalPath({
  location,
  categorySlug,
  slug,
  status,
}: CanonicalPathInputs): string | null {
  if (!location || !slug || !categorySlug) return null
  if (status !== 'published') return null

  const parts = location.split('|').filter(Boolean)

  if (parts.length === 1) {
    const [country] = parts
    return `/${country}/${categorySlug}/${slug}`
  }

  if (parts.length >= 2) {
    const [country, city] = parts
    return `/${country}/${city}/${categorySlug}/${slug}`
  }

  return null
}

/**
 * Resolve a category relationship value (string ID or populated doc) into its slug.
 */
export async function resolveCategorySlug(
  payload: Payload,
  categoryRef: unknown,
): Promise<string | null> {
  if (!categoryRef) return null

  if (typeof categoryRef === 'object') {
    const obj = categoryRef as Record<string, unknown>
    if (typeof obj.slug === 'string' && obj.slug.length > 0) return obj.slug
    if (typeof obj.id === 'string' || typeof obj.id === 'number') {
      return fetchCategorySlugById(payload, obj.id)
    }
    return null
  }

  if (typeof categoryRef === 'string' || typeof categoryRef === 'number') {
    return fetchCategorySlugById(payload, categoryRef)
  }

  return null
}

async function fetchCategorySlugById(
  payload: Payload,
  id: string | number,
): Promise<string | null> {
  try {
    const doc = (await payload.findByID({
      collection: 'article-categories',
      id: String(id),
      depth: 0,
      overrideAccess: true,
    })) as unknown as { slug?: unknown } | null
    if (doc && typeof doc.slug === 'string') return doc.slug
    return null
  } catch {
    return null
  }
}

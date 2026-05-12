import type { Payload } from 'payload'

/**
 * Category slugs and country/city slugs must not collide.
 *
 * Reason: the public URL `/${country}/${segmentA}/${segmentB}` is resolved
 * by `canonicalPath` lookup. If `segmentA` could be either a city OR a
 * category, two different articles could fight for the same canonical path
 * (e.g., a country-scope article in category `lima` and the city `lima`).
 * We block that at write time.
 *
 * These helpers expect to be called from a Payload field `validate` hook
 * with the request's payload instance available on `req.payload`.
 */

type Req = { payload: Payload } | undefined

async function categoryExistsWithSlug(payload: Payload, slug: string): Promise<boolean> {
  const result = await payload.find({
    collection: 'article-categories',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return result.totalDocs > 0
}

async function locationExistsWithSlug(payload: Payload, slug: string): Promise<boolean> {
  // Country or city segment match — neighborhood slugs live deeper than the
  // URL space we care about and don't collide.
  const result = await payload.find({
    collection: 'locations',
    where: {
      or: [{ country: { equals: slug } }, { city: { equals: slug } }],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return result.totalDocs > 0
}

/** For Categories.slug validate hook. */
export async function validateCategorySlugAgainstLocations(
  slug: unknown,
  req: Req,
  currentDocId?: number | string | null,
): Promise<true | string> {
  if (typeof slug !== 'string' || !slug) return true
  if (!req?.payload) return true
  const conflict = await locationExistsWithSlug(req.payload, slug)
  if (!conflict) return true
  void currentDocId
  return `Category slug "${slug}" collides with an existing country or city slug. Rename to avoid URL conflicts.`
}

/** For Locations.country / Locations.city validate hooks. */
export async function validateLocationSlugAgainstCategories(
  slug: unknown,
  req: Req,
): Promise<true | string> {
  if (typeof slug !== 'string' || !slug) return true
  if (!req?.payload) return true
  const conflict = await categoryExistsWithSlug(req.payload, slug)
  if (!conflict) return true
  return `Location slug "${slug}" collides with an existing article category slug. Rename one of them.`
}

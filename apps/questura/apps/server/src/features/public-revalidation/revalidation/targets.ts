import type { PayloadRequest } from 'payload'
import { DEFAULT_LANG } from '@/shared/i18n/languageField'
import { logger } from '@/shared/utils/logger'
import { publicCacheTags, unique } from './cache-tags'
import {
  articleTypeForCollection,
  locationParts,
  publicArticlePath,
  resolveLocationDoc,
  scopeFromLocation,
  stringValue,
} from './documents'
import type { AnyDoc, RevalidationTarget } from './types'

export function articleRevalidationTarget(
  collection: 'articles' | 'single-type-listicles' | 'listicle-itineraries',
  doc: AnyDoc | null | undefined,
): RevalidationTarget {
  if (!doc || stringValue(doc.status) !== 'published') return {}

  const type = articleTypeForCollection(collection)
  const lang = stringValue(doc.language) ?? DEFAULT_LANG
  const slug = stringValue(doc.slug)
  const scope = scopeFromLocation(doc.location)
  const path = publicArticlePath(doc, type)
  const tags = [
    publicCacheTags.sitemap(),
    publicCacheTags.articleIndexScope(scope, type, lang),
    path ? publicCacheTags.articlePath(path, lang) : null,
    slug ? publicCacheTags.article(scope, type, slug, lang) : null,
  ]

  if (type === 'maps' || type === 'itineraries') {
    if (scope.kind === 'city') tags.push(publicCacheTags.relatedMapsScope(scope.country, scope.city))
    if (scope.kind === 'country') tags.push(publicCacheTags.relatedMapsScope(scope.country, null))
  }

  return {
    tags: unique(tags),
    paths: unique([path]),
  }
}
/**
 * Published articles are read a page at a time, not all at once.
 *
 * `pagination: false` asks Postgres for every published document by an
 * author and materialises all of them, with every field, inside the editor's
 * save. On today's corpus that is small. It is also the one query in the
 * refresh path whose cost is the size of a person's career, on a request that
 * is holding a write transaction open — which is exactly the shape that stops
 * being fine quietly.
 *
 * Only the five fields the target is built from are selected, so a page is
 * kilobytes rather than megabytes whatever the article contains.
 */
export const AUTHOR_PAGE_SIZE = 200

/**
 * A fan-out this large is not wrong, but it is worth knowing about: it is one
 * save producing thousands of invalidations, and it will be the thing that
 * makes a CDN's tag quota or an origin's request budget matter.
 */
export const LARGE_FAN_OUT = 500

const AUTHOR_TARGET_FIELDS = {
  id: true,
  slug: true,
  status: true,
  language: true,
  location: true,
  canonicalPath: true,
} as const

export async function authoredArticlesTarget(
  req: PayloadRequest,
  authorId: string | number,
): Promise<RevalidationTarget> {
  const collections = [
    'articles',
    'single-type-listicles',
    'listicle-itineraries',
  ] as const

  const results = await Promise.all(
    collections.map(async (collection) => {
      const targets: RevalidationTarget[] = []

      for (let page = 1; ; page += 1) {
        const result = await req.payload.find({
          collection,
          where: {
            and: [
              { author: { equals: authorId } },
              { status: { equals: 'published' } },
            ],
          },
          depth: 0,
          limit: AUTHOR_PAGE_SIZE,
          page,
          // Cheapest stable order: a page boundary must not shuffle between
          // reads or a document can be skipped.
          sort: 'id',
          select: AUTHOR_TARGET_FIELDS,
          overrideAccess: true,
        })

        for (const article of result.docs) {
          targets.push(articleRevalidationTarget(collection, article as unknown as AnyDoc))
        }

        // `hasNextPage` is the authority; the length check is the fallback for
        // a caller that does not supply it.
        const more = result.hasNextPage ?? result.docs.length === AUTHOR_PAGE_SIZE
        if (!more || result.docs.length === 0) break
      }

      return targets
    }),
  )

  const merged = mergeTargets(...results.flat())
  const size = (merged.tags?.length ?? 0) + (merged.paths?.length ?? 0)
  if (size >= LARGE_FAN_OUT) {
    logger.warn('Large author fan-out', { authorId: String(authorId), targets: size })
  }

  return merged
}

export function mergeTargets(...targets: RevalidationTarget[]): RevalidationTarget {
  return {
    tags: unique(targets.flatMap((target) => target.tags ?? [])),
    paths: unique(targets.flatMap((target) => target.paths ?? [])),
  }
}

export async function locationHomepageTarget(
  req: PayloadRequest,
  doc: AnyDoc | null | undefined,
): Promise<RevalidationTarget> {
  if (!doc) return {}

  const location = await resolveLocationDoc(req, doc.location)
  const parts = locationParts(location)
  const country = parts[0]
  const city = parts[1]
  const neighborhood = parts[2]

  if (!country) return { tags: [publicCacheTags.sitemap()] }

  return {
    tags: unique([
      publicCacheTags.sitemap(),
      publicCacheTags.countryCities(country),
      city ? publicCacheTags.locationHomepage(country, city) : null,
      city && neighborhood
        ? publicCacheTags.locationHomepage(country, city, neighborhood)
        : null,
    ]),
    paths: unique([
      `/${country}`,
      city ? `/${country}/${city}` : null,
      city && neighborhood ? `/${country}/${city}/${neighborhood}` : null,
    ]),
  }
}

export function locationTarget(doc: AnyDoc | null | undefined): RevalidationTarget {
  const parts = locationParts(doc)
  const country = parts[0]
  const city = parts[1]
  const neighborhood = parts[2]
  if (!country) return { tags: [publicCacheTags.sitemap()] }

  return {
    tags: unique([
      publicCacheTags.sitemap(),
      publicCacheTags.countryCities(country),
      city ? publicCacheTags.locationHomepage(country, city) : null,
      city && neighborhood
        ? publicCacheTags.locationHomepage(country, city, neighborhood)
        : null,
    ]),
    paths: unique([
      `/${country}`,
      city ? `/${country}/${city}` : null,
      city && neighborhood ? `/${country}/${city}/${neighborhood}` : null,
    ]),
  }
}

export function authorTarget(doc: AnyDoc | null | undefined): RevalidationTarget {
  if (!doc) return {}

  const slug = stringValue(doc.slug)
  const id = doc.id
  const hasId = typeof id === 'number' || typeof id === 'string'

  return {
    tags: unique([
      slug ? publicCacheTags.author(slug) : null,
      // Legacy /authors/:id URLs fetch (and tag) by numeric id
      hasId ? publicCacheTags.author(id) : null,
    ]),
    paths: unique([slug ? `/authors/${slug}` : null, hasId ? `/authors/${id}` : null]),
  }
}

export function redirectTarget(doc: AnyDoc | null | undefined): RevalidationTarget {
  const oldPath = stringValue(doc?.oldPath)
  return {
    tags: unique([oldPath ? publicCacheTags.articleRedirect(oldPath) : null]),
    paths: unique([oldPath]),
  }
}

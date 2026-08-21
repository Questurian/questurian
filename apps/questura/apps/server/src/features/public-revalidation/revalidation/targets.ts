import type { PayloadRequest } from 'payload'
import { DEFAULT_LANG } from '@/shared/i18n/languageField'
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
      const result = await req.payload.find({
        collection,
        where: {
          and: [
            { author: { equals: authorId } },
            { status: { equals: 'published' } },
          ],
        },
        depth: 0,
        pagination: false,
        overrideAccess: true,
      })

      return result.docs.map((article) =>
        articleRevalidationTarget(collection, article as unknown as AnyDoc),
      )
    }),
  )

  return mergeTargets(...results.flat())
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

  if (!country) return { tags: [publicCacheTags.sitemap()] }

  return {
    tags: unique([
      publicCacheTags.sitemap(),
      publicCacheTags.countryCities(country),
      city ? publicCacheTags.locationHomepage(country, city) : null,
    ]),
    paths: unique([`/${country}`, city ? `/${country}/${city}` : null]),
  }
}

export function locationTarget(doc: AnyDoc | null | undefined): RevalidationTarget {
  const parts = locationParts(doc)
  const country = parts[0]
  const city = parts[1]
  if (!country) return { tags: [publicCacheTags.sitemap()] }

  return {
    tags: unique([
      publicCacheTags.sitemap(),
      publicCacheTags.countryCities(country),
      city ? publicCacheTags.locationHomepage(country, city) : null,
    ]),
    paths: unique([`/${country}`, city ? `/${country}/${city}` : null]),
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

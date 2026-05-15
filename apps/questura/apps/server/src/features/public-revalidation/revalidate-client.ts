import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  PayloadRequest,
} from 'payload'

import { DEFAULT_LANG } from '@/shared/i18n/languageField'

type RevalidationTarget = {
  tags?: string[]
  paths?: string[]
}

type ArticleScope =
  | { kind: 'global' }
  | { kind: 'country'; country: string }
  | { kind: 'city'; country: string; city: string }

type ArticleTypeKey = 'articles' | 'maps' | 'itineraries'

type AnyDoc = Record<string, unknown>

const REVALIDATION_TIMEOUT_MS = 5000

function clientBaseUrl(): string | null {
  const value =
    process.env.QUESTURA_CLIENT_URL ||
    process.env.NEXT_PUBLIC_FRONTEND_URL ||
    process.env.FRONTEND_URL ||
    null

  return value ? value.replace(/\/+$/, '') : null
}

function revalidationSecret(): string | null {
  return process.env.QUESTURA_REVALIDATION_SECRET || process.env.REVALIDATION_SECRET || null
}

function tagPart(value: string | number | null | undefined): string {
  return encodeURIComponent(String(value ?? 'none').trim().toLowerCase())
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}

function scopeTag(scope: ArticleScope): string {
  if (scope.kind === 'city') return `city:${tagPart(scope.country)}:${tagPart(scope.city)}`
  if (scope.kind === 'country') return `country:${tagPart(scope.country)}`
  return 'global'
}

const publicCacheTags = {
  sitemap: () => 'sitemap',
  countryCities: (country: string) => `country-cities:${tagPart(country)}`,
  locationHomepage: (country: string, city: string) =>
    `location-homepage:${tagPart(country)}:${tagPart(city)}`,
  article: (scope: ArticleScope, type: ArticleTypeKey, slug: string, lang: string) =>
    `article:${scopeTag(scope)}:${tagPart(type)}:${tagPart(slug)}:${tagPart(lang)}`,
  articlePath: (path: string, lang: string) => `article-path:${tagPart(path)}:${tagPart(lang)}`,
  articleRedirect: (path: string) => `article-redirect:${tagPart(path)}`,
  articleIndexScope: (scope: ArticleScope, type: ArticleTypeKey, lang: string) =>
    `article-index:${scopeTag(scope)}:${tagPart(type)}:${tagPart(lang)}`,
  relatedMapsScope: (country: string, city: string | null) =>
    `related-maps:${tagPart(country)}:${tagPart(city)}`,
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function idValue(value: unknown): string | number | null {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'string' || typeof id === 'number') return id
  }
  return null
}

function locationParts(doc: AnyDoc | null | undefined): string[] {
  const key = stringValue(doc?.locationKey)
  if (key) return key.split('|').filter(Boolean)

  const location = stringValue(doc?.location)
  if (location) return location.split('|').filter(Boolean)

  const country = stringValue(doc?.country)
  const city = stringValue(doc?.city)
  return [country, city].filter((part): part is string => Boolean(part))
}

function scopeFromLocation(location: unknown): ArticleScope {
  const parts = stringValue(location)?.split('|').filter(Boolean) ?? []
  if (parts.length >= 2) return { kind: 'city', country: parts[0], city: parts[1] }
  if (parts.length === 1) return { kind: 'country', country: parts[0] }
  return { kind: 'global' }
}

function articleHrefForScope(scope: ArticleScope, type: ArticleTypeKey, slug: string): string {
  if (scope.kind === 'global') return `/${type}/${slug}`
  if (scope.kind === 'country') return `/${scope.country}/${type}/${slug}`
  return `/${scope.country}/${scope.city}/${type}/${slug}`
}

function publicArticlePath(doc: AnyDoc, type: ArticleTypeKey): string | null {
  if (stringValue(doc.status) !== 'published') return null

  if (type === 'articles') {
    return stringValue(doc.canonicalPath)
  }

  const slug = stringValue(doc.slug)
  if (!slug) return null
  return articleHrefForScope(scopeFromLocation(doc.location), type, slug)
}

function articleTypeForCollection(
  collection: 'articles' | 'single-type-listicles' | 'listicle-itineraries',
): ArticleTypeKey {
  if (collection === 'single-type-listicles') return 'maps'
  if (collection === 'listicle-itineraries') return 'itineraries'
  return 'articles'
}

async function resolveLocationDoc(req: PayloadRequest, locationValue: unknown): Promise<AnyDoc | null> {
  const id = idValue(locationValue)
  if (!id) return null

  if (locationValue && typeof locationValue === 'object' && 'locationKey' in locationValue) {
    return locationValue as AnyDoc
  }

  try {
    return (await req.payload.findByID({
      collection: 'locations',
      id,
      depth: 0,
      overrideAccess: true,
    })) as unknown as AnyDoc
  } catch {
    return null
  }
}

async function triggerClientRevalidation(target: RevalidationTarget, reason: string): Promise<void> {
  const tags = unique(target.tags)
  const paths = unique(target.paths)
  if (tags.length === 0 && paths.length === 0) return

  const baseUrl = clientBaseUrl()
  const secret = revalidationSecret()
  if (!baseUrl || !secret) {
    console.warn('[public-revalidation] skipped: missing client URL or secret', { reason, tags, paths })
    return
  }

  try {
    const response = await fetch(`${baseUrl}/api/revalidate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-revalidation-secret': secret,
      },
      signal: AbortSignal.timeout(REVALIDATION_TIMEOUT_MS),
      body: JSON.stringify({ tags, paths }),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      console.error('[public-revalidation] failed', {
        reason,
        status: response.status,
        body,
        tags,
        paths,
      })
    }
  } catch (error) {
    console.error('[public-revalidation] failed to call client', { reason, error, tags, paths })
  }
}

function articleRevalidationTarget(
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

function mergeTargets(...targets: RevalidationTarget[]): RevalidationTarget {
  return {
    tags: unique(targets.flatMap((target) => target.tags ?? [])),
    paths: unique(targets.flatMap((target) => target.paths ?? [])),
  }
}

export function revalidateArticleCollection(
  collection: 'articles' | 'single-type-listicles' | 'listicle-itineraries',
) {
  const afterChange: CollectionAfterChangeHook = async ({ doc, previousDoc, operation }) => {
    await triggerClientRevalidation(
      mergeTargets(
        articleRevalidationTarget(collection, previousDoc as AnyDoc | undefined),
        articleRevalidationTarget(collection, doc as AnyDoc | undefined),
      ),
      `${collection}:${operation}`,
    )
  }

  const afterDelete: CollectionAfterDeleteHook = async ({ doc }) => {
    await triggerClientRevalidation(
      articleRevalidationTarget(collection, doc as AnyDoc | undefined),
      `${collection}:delete`,
    )
  }

  return { afterChange, afterDelete }
}

async function locationHomepageTarget(req: PayloadRequest, doc: AnyDoc | null | undefined) {
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

export const revalidateLocationHomepageAfterChange: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
  operation,
}) => {
  await triggerClientRevalidation(
    mergeTargets(
      await locationHomepageTarget(req, previousDoc as AnyDoc | undefined),
      await locationHomepageTarget(req, doc as AnyDoc | undefined),
    ),
    `location-homepages:${operation}`,
  )
}

export const revalidateLocationHomepageAfterDelete: CollectionAfterDeleteHook = async ({
  doc,
  req,
}) => {
  await triggerClientRevalidation(
    await locationHomepageTarget(req, doc as AnyDoc | undefined),
    'location-homepages:delete',
  )
}

function locationTarget(doc: AnyDoc | null | undefined): RevalidationTarget {
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

export const revalidateLocationAfterChange: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
}) => {
  await triggerClientRevalidation(
    mergeTargets(
      locationTarget(previousDoc as AnyDoc | undefined),
      locationTarget(doc as AnyDoc | undefined),
    ),
    `locations:${operation}`,
  )
}

export const revalidateLocationAfterDelete: CollectionAfterDeleteHook = async ({ doc }) => {
  await triggerClientRevalidation(locationTarget(doc as AnyDoc | undefined), 'locations:delete')
}

function redirectTarget(doc: AnyDoc | null | undefined): RevalidationTarget {
  const oldPath = stringValue(doc?.oldPath)
  return {
    tags: unique([oldPath ? publicCacheTags.articleRedirect(oldPath) : null]),
    paths: unique([oldPath]),
  }
}

export const revalidateArticleRedirectAfterChange: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
}) => {
  await triggerClientRevalidation(
    mergeTargets(
      redirectTarget(previousDoc as AnyDoc | undefined),
      redirectTarget(doc as AnyDoc | undefined),
    ),
    `article-redirects:${operation}`,
  )
}

export const revalidateArticleRedirectAfterDelete: CollectionAfterDeleteHook = async ({ doc }) => {
  await triggerClientRevalidation(
    redirectTarget(doc as AnyDoc | undefined),
    'article-redirects:delete',
  )
}

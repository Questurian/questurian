import type { PayloadRequest } from 'payload'
import type { AnyDoc, ArticleScope, ArticleTypeKey } from './types'

export function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function idValue(value: unknown): string | number | null {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'string' || typeof id === 'number') return id
  }
  return null
}

export function locationParts(doc: AnyDoc | null | undefined): string[] {
  const key = stringValue(doc?.locationKey)
  if (key) return key.split('|').filter(Boolean)

  const location = stringValue(doc?.location)
  if (location) return location.split('|').filter(Boolean)

  const country = stringValue(doc?.country)
  const city = stringValue(doc?.city)
  return [country, city].filter((part): part is string => Boolean(part))
}

export function scopeFromLocation(location: unknown): ArticleScope {
  const parts = stringValue(location)?.split('|').filter(Boolean) ?? []
  if (parts.length >= 2) return { kind: 'city', country: parts[0], city: parts[1] }
  if (parts.length === 1) return { kind: 'country', country: parts[0] }
  return { kind: 'global' }
}

export function articleHrefForScope(scope: ArticleScope, type: ArticleTypeKey, slug: string): string {
  if (scope.kind === 'global') return `/${type}/${slug}`
  if (scope.kind === 'country') return `/${scope.country}/${type}/${slug}`
  return `/${scope.country}/${scope.city}/${type}/${slug}`
}

export function publicArticlePath(doc: AnyDoc, type: ArticleTypeKey): string | null {
  if (stringValue(doc.status) !== 'published') return null

  if (type === 'articles') {
    return stringValue(doc.canonicalPath)
  }

  const slug = stringValue(doc.slug)
  if (!slug) return null
  return articleHrefForScope(scopeFromLocation(doc.location), type, slug)
}

export function articleTypeForCollection(
  collection: 'articles' | 'single-type-listicles' | 'listicle-itineraries',
): ArticleTypeKey {
  if (collection === 'single-type-listicles') return 'maps'
  if (collection === 'listicle-itineraries') return 'itineraries'
  return 'articles'
}

/**
 * A location that genuinely is not there, as opposed to a lookup that failed.
 *
 * These used to be the same answer. `catch { return null }` turned a timeout,
 * a dropped connection or a pool exhaustion into "this document has no
 * location", and the caller built a target from the remaining fields and
 * reported success. The result is an invalidation that covers the sitemap and
 * nothing else — the country and city pages that actually changed are never
 * refreshed, and nothing anywhere records that they were missed.
 *
 * A missing row is a real answer and stays `null`. Anything else is rethrown,
 * which fails the save (features/refresh-outbox/request.ts) rather than
 * publishing a half-built target.
 */
export class LocationLookupFailed extends Error {
  constructor(
    readonly locationId: string | number,
    cause: unknown,
  ) {
    super(
      `Could not read location ${String(locationId)} while working out what to refresh, so the ` +
        `invalidation would have been incomplete. Nothing was published; try saving again. ` +
        `Detail: ${cause instanceof Error ? cause.message : String(cause)}`,
    )
    this.name = 'LocationLookupFailed'
  }
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { name?: unknown; status?: unknown; message?: unknown }
  if (candidate.name === 'NotFound') return true
  if (candidate.status === 404) return true
  return typeof candidate.message === 'string' && /not found/i.test(candidate.message)
}

export async function resolveLocationDoc(req: PayloadRequest, locationValue: unknown): Promise<AnyDoc | null> {
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
  } catch (error) {
    if (isNotFound(error)) return null
    throw new LocationLookupFailed(id, error)
  }
}

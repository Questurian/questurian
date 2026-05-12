import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { DEFAULT_LANG } from '@/shared/i18n/languageField'

export const dynamic = 'force-dynamic'

type SitemapEntry = {
  url: string
  lastModified: string | null
}

function parseScopeFromLocationKey(
  locationKey: string,
): { kind: 'country'; country: string } | { kind: 'city'; country: string; city: string } | null {
  const parts = locationKey.split('|').filter(Boolean)
  if (parts.length === 1) return { kind: 'country', country: parts[0] }
  if (parts.length >= 2) return { kind: 'city', country: parts[0], city: parts[1] }
  return null
}

function articleHref(
  scope: { kind: 'country'; country: string } | { kind: 'city'; country: string; city: string } | null,
  type: 'articles' | 'maps' | 'itineraries',
  slug: string,
): string | null {
  if (!scope) return `/${type}/${slug}`
  if (scope.kind === 'country') return `/${scope.country}/${type}/${slug}`
  return `/${scope.country}/${scope.city}/${type}/${slug}`
}

// GET /api/public/sitemap-entries?lang=en
// Returns hubs + indexes + content URLs (relative).
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const lang = url.searchParams.get('lang') ?? DEFAULT_LANG

    const payload = await getPayload({ config })

    const [countries, cities, enabledHomepages, articles, maps, itineraries] = await Promise.all([
      payload.find({
        collection: 'locations',
        where: { level: { equals: 'country' } },
        limit: 500,
        depth: 0,
        overrideAccess: true,
      }),
      payload.find({
        collection: 'locations',
        where: { level: { equals: 'city' } },
        limit: 2000,
        depth: 0,
        overrideAccess: true,
      }),
      payload.find({
        collection: 'location-homepages',
        where: { isEnabled: { equals: true } },
        limit: 2000,
        depth: 0,
        overrideAccess: true,
      }),
      payload.find({
        collection: 'articles',
        where: {
          and: [
            { status: { equals: 'published' } },
            { language: { equals: lang } },
          ],
        },
        limit: 5000,
        depth: 0,
        overrideAccess: true,
      }),
      payload.find({
        collection: 'single-type-listicles',
        where: {
          and: [
            { status: { equals: 'published' } },
            { language: { equals: lang } },
          ],
        },
        limit: 5000,
        depth: 0,
        overrideAccess: true,
      }),
      payload.find({
        collection: 'listicle-itineraries',
        where: {
          and: [
            { status: { equals: 'published' } },
            { language: { equals: lang } },
          ],
        },
        limit: 5000,
        depth: 0,
        overrideAccess: true,
      }),
    ])

    const enabledLocationIds = new Set(
      enabledHomepages.docs
        .map((doc) => {
          const record = doc as unknown as Record<string, unknown>
          const location = record.location
          if (typeof location === 'string' || typeof location === 'number') return String(location)
          if (location && typeof location === 'object' && 'id' in location) {
            return String((location as { id: unknown }).id)
          }
          return null
        })
        .filter((id): id is string => Boolean(id)),
    )

    const hubEntries: SitemapEntry[] = []

    for (const rawCountry of countries.docs) {
      const country = rawCountry as unknown as Record<string, unknown>
      const slug = typeof country.country === 'string' ? country.country : null
      if (!slug) continue
      hubEntries.push({
        url: `/${slug}`,
        lastModified: typeof country.updatedAt === 'string' ? country.updatedAt : null,
      })
    }

    for (const rawCity of cities.docs) {
      const city = rawCity as unknown as Record<string, unknown>
      if (!enabledLocationIds.has(String(city.id))) continue
      const countrySlug = typeof city.country === 'string' ? city.country : null
      const citySlug = typeof city.city === 'string' ? city.city : null
      if (!countrySlug || !citySlug) continue
      hubEntries.push({
        url: `/${countrySlug}/${citySlug}`,
        lastModified: typeof city.updatedAt === 'string' ? city.updatedAt : null,
      })
    }

    const contentEntries: SitemapEntry[] = []
    const indexCounts = new Map<string, number>()

    function recordContent(
      doc: Record<string, unknown>,
      type: 'articles' | 'maps' | 'itineraries',
    ) {
      const slug = typeof doc.slug === 'string' ? doc.slug : null
      if (!slug) return
      const location = typeof doc.location === 'string' ? doc.location : ''
      const scope = parseScopeFromLocationKey(location)
      const canonical = typeof doc.canonicalPath === 'string' ? doc.canonicalPath : null
      // Standard articles only render via canonicalPath under the new URL
      // system. Anything without one (neighborhood scope, missing category)
      // has no public URL — exclude from sitemap. Maps and itineraries still
      // use the legacy scope-based URL builder.
      const href = type === 'articles' ? canonical : canonical ?? articleHref(scope, type, slug)
      if (!href) return
      contentEntries.push({
        url: href,
        lastModified: typeof doc.updatedAt === 'string' ? doc.updatedAt : null,
      })

      const indexKey = (() => {
        if (!scope) return `global:${type}`
        if (scope.kind === 'country') return `${scope.country}:${type}`
        return `${scope.country}/${scope.city}:${type}`
      })()
      indexCounts.set(indexKey, (indexCounts.get(indexKey) ?? 0) + 1)
    }

    for (const doc of articles.docs) {
      recordContent(doc as unknown as Record<string, unknown>, 'articles')
    }
    for (const doc of maps.docs) {
      recordContent(doc as unknown as Record<string, unknown>, 'maps')
    }
    for (const doc of itineraries.docs) {
      recordContent(doc as unknown as Record<string, unknown>, 'itineraries')
    }

    const indexEntries: SitemapEntry[] = []
    for (const key of indexCounts.keys()) {
      const [scopePart, type] = key.split(':') as [string, 'articles' | 'maps' | 'itineraries']
      if (scopePart === 'global') {
        indexEntries.push({ url: `/${type}`, lastModified: null })
      } else if (!scopePart.includes('/')) {
        indexEntries.push({ url: `/${scopePart}/${type}`, lastModified: null })
      } else {
        indexEntries.push({ url: `/${scopePart}/${type}`, lastModified: null })
      }
    }

    return NextResponse.json({
      lang,
      hubs: hubEntries,
      indexes: indexEntries,
      content: contentEntries,
    })
  } catch (error) {
    const message =
      error instanceof Error && error.message ? error.message : 'Failed to load sitemap entries.'
    return NextResponse.json({ message }, { status: 500 })
  }
}

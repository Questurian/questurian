import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { publicRead } from '@/shared/http/public-read'
import { DEFAULT_LANG } from '@/shared/i18n/languageField'
import { authorsWithPublishedContent, readAllPages } from '@/features/articles/public/sitemap-reads'
import type { ArticleTypeKey } from '@/features/articles/public/scope'

export const dynamic = 'force-dynamic'

const ARTICLE_TYPES: ArticleTypeKey[] = ['articles', 'maps', 'itineraries']

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

    // Rate limit, admission, counting and cache headers: shared/http/public-read.ts.
    return await publicRead({ req, scope: 'sitemap', payload }, async () => {
      // Only the fields this route reads, every page of them (sitemap-reads.ts).
      const find = payload.find.bind(payload) as unknown as Parameters<typeof readAllPages>[0]
      const published = { and: [{ status: { equals: 'published' } }, { language: { equals: lang } }] }
      const contentSelect = { slug: true, location: true, canonicalPath: true, updatedAt: true }
      const locationSelect = { country: true, city: true, updatedAt: true }

      const [countries, cities, articles, maps, itineraries, authors] = await Promise.all([
        readAllPages(find, { collection: 'locations', where: { level: { equals: 'country' } }, select: locationSelect }),
        readAllPages(find, { collection: 'locations', where: { level: { equals: 'city' } }, select: locationSelect }),
        readAllPages(find, { collection: 'articles', where: published, select: contentSelect }),
        readAllPages(find, { collection: 'single-type-listicles', where: published, select: contentSelect }),
        readAllPages(find, { collection: 'listicle-itineraries', where: published, select: contentSelect }),
        readAllPages(find, {
          collection: 'authors',
          where: { slug: { exists: true } },
          select: { slug: true, updatedAt: true },
        }),
      ])

      const hubEntries: SitemapEntry[] = []

      for (const rawCountry of countries) {
        const country = rawCountry as unknown as Record<string, unknown>
        const slug = typeof country.country === 'string' ? country.country : null
        if (!slug) continue
        hubEntries.push({
          url: `/${slug}`,
          lastModified: typeof country.updatedAt === 'string' ? country.updatedAt : null,
        })
      }

      for (const rawCity of cities) {
        const city = rawCity as unknown as Record<string, unknown>
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

      for (const doc of articles) {
        recordContent(doc as unknown as Record<string, unknown>, 'articles')
      }
      for (const doc of maps) {
        recordContent(doc as unknown as Record<string, unknown>, 'maps')
      }
      for (const doc of itineraries) {
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

      // Byline implies visibility, so the same check the author route uses to
      // decide between a page and a 404 decides who is enumerable here. Reusing
      // it keeps this list from naming a URL that would 404 on arrival.
      //
      // Not folded into sitemap.xml: the client's sitemap reads hubs, indexes
      // and content only. This array exists so the build can pre-render author
      // pages. Whether they also belong in the sitemap is a separate call.
      const authorEntries: SitemapEntry[] = []
      // One grouped query for "has any published item", not three counts per
      // author: same rule as hasPublishedAuthorContent, which the author route
      // still uses for its single author.
      const visible = await authorsWithPublishedContent(
        (payload.db as unknown as { pool: Parameters<typeof authorsWithPublishedContent>[0] }).pool,
        ARTICLE_TYPES,
      )
      for (const rawAuthor of authors) {
        const author = rawAuthor as unknown as Record<string, unknown>
        const slug = typeof author.slug === 'string' && author.slug ? author.slug : null
        const id = author.id
        if (!slug || (typeof id !== 'number' && typeof id !== 'string')) continue
        if (!visible.has(String(id))) continue
        authorEntries.push({
          url: `/authors/${slug}`,
          lastModified: typeof author.updatedAt === 'string' ? author.updatedAt : null,
        })
      }

      return NextResponse.json({
        lang,
        hubs: hubEntries,
        indexes: indexEntries,
        content: contentEntries,
        authors: authorEntries,
      })
    })
  } catch (error) {
    const message =
      error instanceof Error && error.message ? error.message : 'Failed to load sitemap entries.'
    return NextResponse.json({ message }, { status: 500 })
  }
}

/**
 * Sorts the flat URL list from /api/public/sitemap-entries into the params
 * each public route needs for `generateStaticParams`.
 *
 * The endpoint hands back URL strings, not route shapes, and several public
 * routes overlap on segment count: `/peru/lima` and `/articles/<slug>` are
 * both two segments, `/peru/lima/maps` (an index) and `/peru/guides/<slug>`
 * (a country-scope article) are both three. Every selector below therefore
 * matches on the segment that actually disambiguates, and a URL that matches
 * nothing is simply left out — it stays on the render-on-first-request path
 * that all of these URLs use today.
 *
 * Kept free of value imports on purpose: publicRouteParams.test.mjs loads it
 * through node's --experimental-strip-types, which does not resolve the `@/`
 * alias.
 */

/**
 * The URL segments that mean "article type" rather than a slug.
 *
 * Duplicated from ARTICLE_TYPE_SEGMENTS in src/lib/reservedSlugs.ts so this
 * module stays import-free; publicRouteParams.test.mjs fails if the two ever
 * drift apart.
 */
export const TYPE_SEGMENTS = ['articles', 'maps', 'itineraries'] as const

export type TypeSegment = (typeof TYPE_SEGMENTS)[number]

const TYPE_SEGMENT_SET: ReadonlySet<string> = new Set(TYPE_SEGMENTS)

function isTypeSegment(segment: string | undefined): boolean {
  return segment !== undefined && TYPE_SEGMENT_SET.has(segment)
}

/** `/peru/lima/maps/best-brunch?x=1#y` -> `['peru','lima','maps','best-brunch']` */
export function toSegments(url: string): string[] {
  return url.split('#')[0].split('?')[0].split('/').filter(Boolean)
}

function segmentsOf(urls: readonly string[]): string[][] {
  return urls.map(toSegments)
}

/** `/[country]` — the country hubs. */
export function countryParams(urls: readonly string[]): { country: string }[] {
  return segmentsOf(urls)
    .filter((s) => s.length === 1 && !isTypeSegment(s[0]))
    .map(([country]) => ({ country }))
}

/** `/[country]/[city]` — the city homepages. */
export function cityParams(urls: readonly string[]): { country: string; city: string }[] {
  return segmentsOf(urls)
    .filter((s) => s.length === 2 && !isTypeSegment(s[0]) && !isTypeSegment(s[1]))
    .map(([country, city]) => ({ country, city }))
}

/**
 * `/[country]/[city]/[category]` — country-scope articles such as
 * `/peru/guides/peru-visa-and-entry-requirements`. The folder names say
 * city/category, but in this three-segment route they carry the category and
 * the article slug; see the note in that page file.
 *
 * Neighborhood homepages share this route and are not enumerated anywhere, so
 * they keep rendering on demand.
 */
export function countryScopeArticleParams(
  urls: readonly string[],
): { country: string; city: string; category: string }[] {
  return segmentsOf(urls)
    .filter(
      (s) => s.length === 3 && !isTypeSegment(s[0]) && !isTypeSegment(s[1]) && !isTypeSegment(s[2]),
    )
    .map(([country, city, category]) => ({ country, city, category }))
}

/**
 * `/[country]/[city]/[category]/[slug]` — city-scope articles.
 *
 * A URL whose third segment is an article type belongs to the more specific
 * `/maps/[slug]` or `/itineraries/[slug]` route, which Next matches first, so
 * it is excluded here rather than pre-built twice.
 */
export function cityScopeArticleParams(
  urls: readonly string[],
): { country: string; city: string; category: string; slug: string }[] {
  return segmentsOf(urls)
    .filter((s) => s.length === 4 && !isTypeSegment(s[0]) && !isTypeSegment(s[2]))
    .map(([country, city, category, slug]) => ({ country, city, category, slug }))
}

/** `/[country]/[city]/maps/[slug]` and `/[country]/[city]/itineraries/[slug]`. */
export function typedCityArticleParams(
  urls: readonly string[],
  type: TypeSegment,
): { country: string; city: string; slug: string }[] {
  return segmentsOf(urls)
    .filter((s) => s.length === 4 && !isTypeSegment(s[0]) && s[2] === type)
    .map(([country, city, , slug]) => ({ country, city, slug }))
}

/** `/articles/[slug]` — articles with no country or city scope. */
export function globalArticleParams(urls: readonly string[]): { slug: string }[] {
  return segmentsOf(urls)
    .filter((s) => s.length === 2 && s[0] === 'articles')
    .map(([, slug]) => ({ slug }))
}

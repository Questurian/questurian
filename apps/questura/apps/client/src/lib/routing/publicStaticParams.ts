import { config } from '@/lib/config'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'

/**
 * The one build-time read of every public URL, shared by the
 * `generateStaticParams` of every public route.
 *
 * Without these params each public route is marked static but has no concrete
 * URL at deploy time, so the first request to a URL — often Google's crawler
 * rather than a person — pays a live render against the backend. The city
 * homepage cost 902 ms that way; see
 * docs/navigation-speed-handoff-2026-09-20.html.
 */

type SitemapEntry = { url: string; lastModified: string | null }

type SitemapEntriesResponse = {
  lang: string
  hubs: SitemapEntry[]
  indexes: SitemapEntry[]
  content: SitemapEntry[]
  authors: SitemapEntry[]
}

export type PublicUrlIndex = {
  /** Every page URL the backend knows about, relative and leading-slashed. */
  pages: string[]
  /** Author slugs, which have no URL shape worth re-parsing. */
  authorSlugs: string[]
}

const EMPTY: PublicUrlIndex = { pages: [], authorSlugs: [] }

/**
 * Set to `1` to let a build finish with nothing pre-built when the backend is
 * unreachable. Off by default: a build that silently yields zero params looks
 * exactly like the un-pre-built site we are trying to leave behind, so a
 * backend blip would ship as a performance regression nobody noticed.
 */
const ALLOW_EMPTY = process.env.ALLOW_EMPTY_STATIC_PARAMS === '1'

function isEntryArray(value: unknown): value is SitemapEntry[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof (entry as SitemapEntry | null)?.url === 'string')
  )
}

async function loadPublicUrlIndex(): Promise<PublicUrlIndex> {
  // `next dev` calls generateStaticParams on every request to a dynamic route.
  // Pre-building buys nothing there — dev compiles and renders on demand
  // regardless — and a backend that is down would turn into a thrown page
  // rather than the empty state dev already handles.
  if (process.env.NODE_ENV === 'development') return EMPTY

  const url = `${config.backendUrl}/api/public/sitemap-entries?lang=${DEFAULT_LOCALE}`

  let data: SitemapEntriesResponse
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    data = (await res.json()) as SitemapEntriesResponse
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    if (ALLOW_EMPTY) {
      console.warn(
        `[static-params] ${url} failed (${reason}). ALLOW_EMPTY_STATIC_PARAMS=1, so this build pre-renders no public URLs.`,
      )
      return EMPTY
    }
    throw new Error(
      `Could not read public URLs from ${url}: ${reason}. ` +
        'The build would otherwise pre-render nothing and every page would be rendered live on its first request. ' +
        'Start the backend, or set ALLOW_EMPTY_STATIC_PARAMS=1 to accept that.',
      { cause: error },
    )
  }

  const groups = [data?.hubs, data?.indexes, data?.content, data?.authors]
  if (!groups.every(isEntryArray)) {
    throw new Error(
      `${url} did not return the expected {hubs, indexes, content, authors} arrays. ` +
        'Refusing to pre-render a partial site from a response this code does not understand.',
    )
  }

  return {
    pages: [...data.hubs, ...data.indexes, ...data.content].map((entry) => entry.url),
    authorSlugs: data.authors.map((entry) => entry.url.replace(/^\/authors\//, '')),
  }
}

let pending: Promise<PublicUrlIndex> | null = null

/**
 * Memoized for the life of the build process: `generateStaticParams` runs once
 * per route, and all of them want the same list. A rejected read is not
 * cached, so a retry can still succeed.
 */
export function publicUrlIndex(): Promise<PublicUrlIndex> {
  if (!pending) {
    pending = loadPublicUrlIndex().catch((error) => {
      pending = null
      throw error
    })
  }
  return pending
}

/** Test seam: drops the memoized read. */
export function resetPublicUrlIndex(): void {
  pending = null
}

import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowUpRight, Search } from 'lucide-react'

import { fetchCityHomepage } from '@/features/CityDashboard'
import { LocationContentList } from '@/features/search/components/LocationContentList'
import {
  fetchLocationContent,
  searchLocations,
  type LocationContentResponse,
  type LocationSearchItem,
} from '@/features/search/lib/fetchSearch'

type Props = {
  searchParams: Promise<{ q?: string; location?: string; page?: string }>
}

// The (public) layout forces static rendering, which would blank out
// searchParams on the server. Search is inherently query-driven.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Search — Questurian',
  description: 'Find Questurian guides, maps, and itineraries for any destination.',
  robots: { index: false },
}

function locationHref(key: string, page: number): string {
  const params = new URLSearchParams()
  params.set('location', key)
  if (page > 1) params.set('page', String(page))
  return `/search?${params.toString()}`
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

// Prefer an exact name/slug match; otherwise take the first result
// (already ordered country → city → neighborhood).
function pickBestMatch(q: string, matches: LocationSearchItem[]): LocationSearchItem | null {
  if (matches.length === 0) return null
  const needle = normalize(q)
  const exact = matches.find((match) => {
    const ownSlug = match.neighborhood ?? match.city ?? match.country
    const ownName = normalize(match.label.split(',')[0] ?? '')
    return ownSlug === needle.replace(/\s+/g, '-') || ownName === needle
  })
  return exact ?? matches[0]
}

// Href of the location's own page, when one exists: countries always have
// one, cities (and their neighborhoods) only when the homepage is turned on.
async function resolveLocationPageHref(locationKey: string): Promise<string | null> {
  const [country, city] = locationKey.split('|')
  if (!city) return `/${country}`
  const homepage = await fetchCityHomepage(country, city)
  return homepage ? `/${country}/${city}` : null
}

export default async function SearchPage({ searchParams }: Props) {
  const { q, location, page: pageParam } = await searchParams
  const page = Math.max(1, Number(pageParam) || 1)

  let content: LocationContentResponse | null = null
  let noResults = false

  if (location) {
    content = await fetchLocationContent(location, page)
  } else if (q) {
    const best = pickBestMatch(q, await searchLocations(q))
    if (best) {
      content = await fetchLocationContent(best.locationKey, page)
    } else {
      noResults = true
    }
  }

  const locationPageHref = content
    ? await resolveLocationPageHref(content.location.locationKey)
    : null

  return (
    <section className="min-h-[70vh] bg-background px-5 py-16 text-foreground 768:px-10 1024:px-16">
      <div className="mx-auto max-w-3xl">
        <form action="/search" method="get" className="mb-10">
          <div className="flex items-center gap-3 border-b border-foreground/30 pb-3 focus-within:border-foreground">
            <Search className="size-5 shrink-0 text-foreground/45" strokeWidth={1.5} aria-hidden />
            <input
              type="search"
              name="q"
              defaultValue=""
              placeholder="Search a country, city, or neighborhood…"
              className="w-full bg-transparent text-[18px] leading-7 text-foreground outline-none placeholder:text-foreground/40"
              autoComplete="off"
            />
          </div>
        </form>

        {content ? (
          <>
            <h1 className="mb-8 font-display text-[36px] font-medium leading-[1] text-foreground 480:text-[48px]">
              {locationPageHref ? (
                <Link
                  href={locationPageHref}
                  className="group inline-flex items-baseline gap-2 outline-none hover:underline focus-visible:underline underline-offset-8"
                >
                  {content.location.label}
                  <ArrowUpRight
                    className="size-6 shrink-0 self-center text-foreground/45 transition group-hover:translate-x-1 group-hover:-translate-y-1 group-hover:text-foreground"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                </Link>
              ) : (
                content.location.label
              )}
            </h1>
            <LocationContentList
              content={content}
              pageHref={(nextPage) => locationHref(content.location.locationKey, nextPage)}
            />
          </>
        ) : noResults ? (
          <p className="text-[15px] leading-7 text-foreground/60">No results for “{q}”.</p>
        ) : null}
      </div>
    </section>
  )
}

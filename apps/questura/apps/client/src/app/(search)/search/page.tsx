import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowUpRight, Search } from 'lucide-react'

import { fetchCityHomepage } from '@/features/CityDashboard'
import { LocationContentList } from '@/features/search/components/LocationContentList'
import {
  fetchLocationContent,
  searchArticles,
  type ArticleSearchResponse,
  type LocationContentResponse,
} from '@/features/search/lib/fetchSearch'

type Props = {
  searchParams: Promise<{ q?: string; location?: string; page?: string }>
}

// The (public) layout forces static rendering, which would blank out
// searchParams on the server. Search is inherently query-driven.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Search — Questurian',
  description: 'Find Questurian articles, guides, maps, and itineraries.',
  robots: { index: false },
}

function locationHref(key: string, page: number): string {
  const params = new URLSearchParams()
  params.set('location', key)
  if (page > 1) params.set('page', String(page))
  return `/search?${params.toString()}`
}

function searchHref(q: string, page: number): string {
  const params = new URLSearchParams()
  params.set('q', q)
  if (page > 1) params.set('page', String(page))
  return `/search?${params.toString()}`
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
  const query = q?.trim() ?? ''
  const page = Math.max(1, Number(pageParam) || 1)

  let content: LocationContentResponse | null = null
  let articleResults: ArticleSearchResponse | null = null
  let noResults = false

  if (location) {
    content = await fetchLocationContent(location, page)
  } else if (query) {
    articleResults = await searchArticles(query, page)
    noResults = !articleResults || articleResults.totalDocs === 0
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
              defaultValue={query}
              placeholder="Search articles, guides, maps, and itineraries…"
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
        ) : articleResults && articleResults.totalDocs > 0 ? (
          <>
            <h1 className="mb-3 font-display text-[36px] font-medium leading-[1] text-foreground 480:text-[48px]">
              Search results for “{articleResults.q}”
            </h1>
            <p className="mb-8 text-[14px] leading-6 text-foreground/60">
              {articleResults.totalDocs} {articleResults.totalDocs === 1 ? 'result' : 'results'}
            </p>
            <LocationContentList
              content={articleResults}
              pageHref={(nextPage) => searchHref(articleResults.q, nextPage)}
              emptyMessage={`No results for "${articleResults.q}".`}
            />
          </>
        ) : noResults ? (
          <p className="text-[15px] leading-7 text-foreground/60">No results for “{query}”.</p>
        ) : null}
      </div>
    </section>
  )
}

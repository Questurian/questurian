import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { fetchArticle } from '@/features/articles/lib/fetchArticle'
import { isListicleItineraryArticle } from '@/features/articles/types/itineraryListicle'
import {
  guardArticleSlug,
  guardCitySegment,
  guardCountrySegment,
} from '@/lib/routing/guardReservedSegment'

type Props = {
  children: ReactNode
  params: Promise<{ country: string; city: string; slug: string }>
}

// This segment has a loading.tsx, and Next wraps the page in that Suspense
// boundary. Anything the page decides happens after the shell has streamed
// with HTTP 200, so a notFound() there answers 200 + noindex, not 404. The
// layout sits above the boundary, so the existence decision lives here: a
// missing or draft itinerary is a real 404 before a byte is sent.
//
// The page fetches the same article with the same URL and options, so Next's
// request memoization serves it from this lookup rather than a second call.
export default async function CityItineraryArticleLayout({ children, params }: Props) {
  const { country, city, slug } = await params
  guardCountrySegment(country)
  guardCitySegment(city)
  guardArticleSlug(slug)

  const article = await fetchArticle({
    scope: { kind: 'city', country, city },
    type: 'itineraries',
    slug,
  })
  if (!article || !isListicleItineraryArticle(article)) {
    notFound()
  }

  return children
}

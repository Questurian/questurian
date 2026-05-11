import type { Metadata } from 'next'
import { redirect, notFound } from 'next/navigation'
import { ArticleIndexPage } from '@/features/articles/components/ArticleIndexPage'
import { buildArticleIndexMetadata } from '@/features/articles/lib/buildArticleMetadata'
import {
  guardCitySegment,
  guardCountrySegment,
} from '@/lib/routing/guardReservedSegment'

type Props = {
  params: Promise<{ country: string; city: string; page: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country, city, page: pageRaw } = await params
  const page = Number(pageRaw)
  return buildArticleIndexMetadata({
    scope: { kind: 'city', country, city },
    type: 'itineraries',
    page: Number.isInteger(page) && page > 0 ? page : 1,
  })
}

export default async function CityItinerariesPaginatedPage({ params }: Props) {
  const { country, city, page: pageRaw } = await params
  guardCountrySegment(country)
  guardCitySegment(city)

  const page = Number(pageRaw)
  if (!Number.isInteger(page) || page < 1) notFound()
  if (page === 1) redirect(`/${country}/${city}/itineraries`)

  return (
    <ArticleIndexPage
      scope={{ kind: 'city', country, city }}
      type="itineraries"
      page={page}
    />
  )
}

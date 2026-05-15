import type { Metadata } from 'next'
import { renderItineraryArticleRoute } from '@/features/articles/routes/renderItineraryArticleRoute'
import {
  guardArticleSlug,
  guardCitySegment,
  guardCountrySegment,
} from '@/lib/routing/guardReservedSegment'
import { buildArticleMetadata } from '@/features/articles/lib/buildArticleMetadata'

type Props = {
  params: Promise<{ country: string; city: string; slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country, city, slug } = await params
  return buildArticleMetadata({
    scope: { kind: 'city', country, city },
    type: 'itineraries',
    slug,
  })
}

export default async function CityItineraryArticlePage({ params }: Props) {
  const { country, city, slug } = await params
  guardCountrySegment(country)
  guardCitySegment(city)
  guardArticleSlug(slug)

  return renderItineraryArticleRoute({
    scope: { kind: 'city', country, city },
    slug,
  })
}

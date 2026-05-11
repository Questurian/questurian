import type { Metadata } from 'next'
import { renderMapsArticleRoute } from '@/features/articles/routes/renderMapsArticleRoute'
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
    type: 'maps',
    slug,
  })
}

export default async function CityMapsArticlePage({ params }: Props) {
  const { country, city, slug } = await params
  guardCountrySegment(country)
  guardCitySegment(city)
  guardArticleSlug(slug)

  return renderMapsArticleRoute({
    scope: { kind: 'city', country, city },
    slug,
  })
}

import type { Metadata } from 'next'
import { ArticleIndexPage } from '@/features/articles/components/ArticleIndexPage'
import { buildArticleIndexMetadata } from '@/features/articles/lib/buildArticleMetadata'
import {
  guardCitySegment,
  guardCountrySegment,
} from '@/lib/routing/guardReservedSegment'

type Props = {
  params: Promise<{ country: string; city: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country, city } = await params
  return buildArticleIndexMetadata({
    scope: { kind: 'city', country, city },
    type: 'maps',
    page: 1,
  })
}

export default async function CityMapsIndexPage({ params }: Props) {
  const { country, city } = await params
  guardCountrySegment(country)
  guardCitySegment(city)

  return (
    <ArticleIndexPage
      scope={{ kind: 'city', country, city }}
      type="maps"
      page={1}
    />
  )
}

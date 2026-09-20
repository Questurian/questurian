import type { Metadata } from 'next'
import { renderMapsArticleRoute } from '@/features/articles/routes/renderMapsArticleRoute'
import {
  guardArticleSlug,
  guardCitySegment,
  guardCountrySegment,
} from '@/lib/routing/guardReservedSegment'
import { buildArticleMetadata } from '@/features/articles/lib/buildArticleMetadata'
import { typedCityArticleParams } from '@/lib/routing/publicRouteParams'
import { publicUrlIndex } from '@/lib/routing/publicStaticParams'

// Pre-rendered at build time so a first visitor — often the crawler — is
// served a cached page instead of paying a live render. dynamicParams stays at
// its default, so a map published after the last deploy still renders on
// demand. See src/lib/routing/publicStaticParams.ts.
export async function generateStaticParams() {
  const { pages } = await publicUrlIndex()
  return typedCityArticleParams(pages, 'maps')
}

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

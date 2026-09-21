import type { Metadata } from 'next'
import {
  CityDashboardPage,
  CityHomepageContent,
  fetchNeighborhoodHomepage,
} from '@/features/CityDashboard'
import { renderStandardArticleByPath } from '@/features/articles/routes/renderStandardArticleByPath'
import {
  guardArticleSlug,
  guardCategorySegment,
  guardCountrySegment,
} from '@/lib/routing/guardReservedSegment'
import { buildArticleMetadataByPath } from '@/features/articles/lib/buildArticleMetadata'
import { countryScopeArticleParams } from '@/lib/routing/publicRouteParams'
import { publicUrlIndex } from '@/lib/routing/publicStaticParams'

// Country-scope category article: /[country]/[categorySlug]/[articleSlug]
// (3 segments). The folder names are [city]/[category] because they sit
// inside the existing city-scope tree, but in this 3-segment handler the
// `city` param is actually the category slug and the `category` param is
// actually the article slug — both interpreted by canonicalPath lookup.
// Pre-rendered at build time so a first visitor — often the crawler — is
// served a cached page instead of paying a live render. dynamicParams stays at
// its default, so a country-scope article published after the last deploy still renders on
// demand. See src/lib/routing/publicStaticParams.ts.
export async function generateStaticParams() {
  const { pages } = await publicUrlIndex()
  return countryScopeArticleParams(pages)
}

type Props = {
  params: Promise<{ country: string; city: string; category: string }>
}

function buildPath(country: string, categorySlug: string, articleSlug: string): string {
  return `/${country}/${categorySlug}/${articleSlug}`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country, city, category } = await params
  const neighborhood = await fetchNeighborhoodHomepage(country, city, category)
  if (neighborhood) {
    const label = category
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
    return {
      title: `${label} — Questurian`,
      description: `Your Questurian guide to ${label}.`,
      openGraph: {
        title: `${label} — Questurian`,
        url: `/${country}/${city}/${category}`,
      },
    }
  }
  return buildArticleMetadataByPath({
    path: buildPath(country, city, category),
  })
}

export default async function CountryCategoryArticlePage({ params }: Props) {
  const { country, city, category } = await params
  guardCountrySegment(country)

  const neighborhood = await fetchNeighborhoodHomepage(country, city, category)
  if (neighborhood) {
    return (
      <>
        <CityHomepageContent
          pageBlocks={neighborhood.pageBlocks}
          location={neighborhood.location}
        />
        <CityDashboardPage citySlug={city} countrySlug={country} />
      </>
    )
  }

  guardCategorySegment(city)
  guardArticleSlug(category)

  return renderStandardArticleByPath({
    path: buildPath(country, city, category),
  })
}

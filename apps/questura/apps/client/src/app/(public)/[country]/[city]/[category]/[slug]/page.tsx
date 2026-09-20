import type { Metadata } from 'next'
import { renderStandardArticleByPath } from '@/features/articles/routes/renderStandardArticleByPath'
import {
  guardArticleSlug,
  guardCategorySegment,
  guardCitySegment,
  guardCountrySegment,
} from '@/lib/routing/guardReservedSegment'
import { buildArticleMetadataByPath } from '@/features/articles/lib/buildArticleMetadata'
import { cityScopeArticleParams } from '@/lib/routing/publicRouteParams'
import { publicUrlIndex } from '@/lib/routing/publicStaticParams'

// Pre-rendered at build time so a first visitor — often the crawler — is
// served a cached page instead of paying a live render. dynamicParams stays at
// its default, so a article published after the last deploy still renders on
// demand. See src/lib/routing/publicStaticParams.ts.
export async function generateStaticParams() {
  const { pages } = await publicUrlIndex()
  return cityScopeArticleParams(pages)
}

type Props = {
  params: Promise<{ country: string; city: string; category: string; slug: string }>
}

function buildPath(country: string, city: string, category: string, slug: string): string {
  return `/${country}/${city}/${category}/${slug}`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country, city, category, slug } = await params
  return buildArticleMetadataByPath({ path: buildPath(country, city, category, slug) })
}

export default async function CityCategoryArticlePage({ params }: Props) {
  const { country, city, category, slug } = await params
  guardCountrySegment(country)
  guardCitySegment(city)
  guardCategorySegment(category)
  guardArticleSlug(slug)

  return renderStandardArticleByPath({ path: buildPath(country, city, category, slug) })
}

import type { Metadata } from 'next'
import { renderStandardArticleByPath } from '@/features/articles/routes/renderStandardArticleByPath'
import {
  guardArticleSlug,
  guardCategorySegment,
  guardCitySegment,
  guardCountrySegment,
} from '@/lib/routing/guardReservedSegment'
import { buildArticleMetadataByPath } from '@/features/articles/lib/buildArticleMetadata'

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

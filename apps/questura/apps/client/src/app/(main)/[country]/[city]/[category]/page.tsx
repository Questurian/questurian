import type { Metadata } from 'next'
import { renderStandardArticleByPath } from '@/features/articles/routes/renderStandardArticleByPath'
import {
  guardArticleSlug,
  guardCategorySegment,
  guardCountrySegment,
} from '@/lib/routing/guardReservedSegment'
import { buildArticleMetadataByPath } from '@/features/articles/lib/buildArticleMetadata'

// Country-scope category article: /[country]/[categorySlug]/[articleSlug]
// (3 segments). The folder names are [city]/[category] because they sit
// inside the existing city-scope tree, but in this 3-segment handler the
// `city` param is actually the category slug and the `category` param is
// actually the article slug — both interpreted by canonicalPath lookup.
type Props = {
  params: Promise<{ country: string; city: string; category: string }>
}

function buildPath(country: string, categorySlug: string, articleSlug: string): string {
  return `/${country}/${categorySlug}/${articleSlug}`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country, city, category } = await params
  return buildArticleMetadataByPath({ path: buildPath(country, city, category) })
}

export default async function CountryCategoryArticlePage({ params }: Props) {
  const { country, city, category } = await params
  guardCountrySegment(country)
  guardCategorySegment(city)
  guardArticleSlug(category)

  return renderStandardArticleByPath({ path: buildPath(country, city, category) })
}

import type { Metadata } from 'next'
import { renderStandardArticleRoute } from '@/features/articles/routes/renderStandardArticleRoute'
import { guardArticleSlug, guardCountrySegment } from '@/lib/routing/guardReservedSegment'
import { buildArticleMetadata } from '@/features/articles/lib/buildArticleMetadata'

type Props = {
  params: Promise<{ country: string; slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country, slug } = await params
  return buildArticleMetadata({
    scope: { kind: 'country', country },
    type: 'articles',
    slug,
  })
}

export default async function CountryArticlePage({ params }: Props) {
  const { country, slug } = await params
  guardCountrySegment(country)
  guardArticleSlug(slug)

  return renderStandardArticleRoute({
    scope: { kind: 'country', country },
    slug,
  })
}

import type { Metadata } from 'next'
import { ArticleIndexPage } from '@/features/articles/components/ArticleIndexPage'
import { buildArticleIndexMetadata } from '@/features/articles/lib/buildArticleMetadata'
import { guardCountrySegment } from '@/lib/routing/guardReservedSegment'

type Props = {
  params: Promise<{ country: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country } = await params
  return buildArticleIndexMetadata({
    scope: { kind: 'country', country },
    type: 'articles',
    page: 1,
  })
}

export default async function CountryArticlesIndexPage({ params }: Props) {
  const { country } = await params
  guardCountrySegment(country)

  return (
    <ArticleIndexPage
      scope={{ kind: 'country', country }}
      type="articles"
      page={1}
    />
  )
}

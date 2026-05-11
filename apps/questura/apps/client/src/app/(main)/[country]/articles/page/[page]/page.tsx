import type { Metadata } from 'next'
import { redirect, notFound } from 'next/navigation'
import { ArticleIndexPage } from '@/features/articles/components/ArticleIndexPage'
import { buildArticleIndexMetadata } from '@/features/articles/lib/buildArticleMetadata'
import { guardCountrySegment } from '@/lib/routing/guardReservedSegment'

type Props = {
  params: Promise<{ country: string; page: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country, page: pageRaw } = await params
  const page = Number(pageRaw)
  return buildArticleIndexMetadata({
    scope: { kind: 'country', country },
    type: 'articles',
    page: Number.isInteger(page) && page > 0 ? page : 1,
  })
}

export default async function CountryArticlesPaginatedPage({ params }: Props) {
  const { country, page: pageRaw } = await params
  guardCountrySegment(country)

  const page = Number(pageRaw)
  if (!Number.isInteger(page) || page < 1) notFound()
  if (page === 1) redirect(`/${country}/articles`)

  return (
    <ArticleIndexPage
      scope={{ kind: 'country', country }}
      type="articles"
      page={page}
    />
  )
}

import type { Metadata } from 'next'
import { redirect, notFound } from 'next/navigation'
import { ArticleIndexPage } from '@/features/articles/components/ArticleIndexPage'
import { buildArticleIndexMetadata } from '@/features/articles/lib/buildArticleMetadata'

type Props = {
  params: Promise<{ page: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { page: pageRaw } = await params
  const page = Number(pageRaw)
  return buildArticleIndexMetadata({
    scope: { kind: 'global' },
    type: 'articles',
    page: Number.isInteger(page) && page > 0 ? page : 1,
  })
}

export default async function GlobalArticlesPaginatedPage({ params }: Props) {
  const { page: pageRaw } = await params
  const page = Number(pageRaw)
  if (!Number.isInteger(page) || page < 1) notFound()
  if (page === 1) redirect('/articles')

  return <ArticleIndexPage scope={{ kind: 'global' }} type="articles" page={page} />
}

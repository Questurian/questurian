import type { Metadata } from 'next'
import { ArticleIndexPage } from '@/features/articles/components/ArticleIndexPage'
import { buildArticleIndexMetadata } from '@/features/articles/lib/buildArticleMetadata'

export function generateMetadata(): Metadata {
  return buildArticleIndexMetadata({
    scope: { kind: 'global' },
    type: 'articles',
    page: 1,
  })
}

export default function GlobalArticlesIndexPage() {
  return <ArticleIndexPage scope={{ kind: 'global' }} type="articles" page={1} />
}

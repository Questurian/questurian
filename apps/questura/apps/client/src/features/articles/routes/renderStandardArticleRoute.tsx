import { notFound } from 'next/navigation'
import { ArticlePage } from '@/features/articles/ArticlePage'
import { isStandardArticle } from '@/features/articles/lib/articleGuards'
import { fetchArticle } from '@/features/articles/lib/fetchArticle'
import type { StandardArticleRouteType } from './articleRouteTypes'

type RenderStandardArticleRouteParams = {
  country: string
  city?: string | null
  slug: string
  type?: StandardArticleRouteType
}

export async function renderStandardArticleRoute({
  country,
  city,
  slug,
  type,
}: RenderStandardArticleRouteParams) {
  const article = await fetchArticle({ country, city, slug, type })

  if (!article || !isStandardArticle(article)) {
    notFound()
  }

  return <ArticlePage article={article} />
}

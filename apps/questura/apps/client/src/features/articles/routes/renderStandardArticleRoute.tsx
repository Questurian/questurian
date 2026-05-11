import { notFound } from 'next/navigation'
import { ArticlePage } from '@/features/articles/ArticlePage'
import { isStandardArticle } from '@/features/articles/lib/articleGuards'
import { fetchArticle } from '@/features/articles/lib/fetchArticle'
import type { ArticleScope } from '@/features/articles/lib/articleScope'

type RenderStandardArticleRouteParams = {
  scope: ArticleScope
  slug: string
  lang?: string
}

export async function renderStandardArticleRoute({
  scope,
  slug,
  lang,
}: RenderStandardArticleRouteParams) {
  const article = await fetchArticle({ scope, type: 'articles', slug, lang })

  if (!article || !isStandardArticle(article)) {
    notFound()
  }

  return <ArticlePage article={article} />
}

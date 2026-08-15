import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/seo/JsonLd'
import { ArticlePage } from '@/features/articles/ArticlePage'
import { isStandardArticle } from '@/features/articles/lib/articleGuards'
import { buildArticleBreadcrumbJsonLd } from '@/features/articles/lib/articleBreadcrumbJsonLd'
import { articleJsonLdNodes } from '@/features/articles/lib/paywallJsonLd'
import { isLocked } from '@/features/articles/lib/gate'
import { fetchArticle } from '@/features/articles/lib/fetchArticle'
import { articleHrefForScope } from '@/features/articles/lib/articleScope'
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

  const canonicalPath = (article as { canonicalPath?: string | null }).canonicalPath
  const path =
    typeof canonicalPath === 'string' && canonicalPath.length > 0
      ? canonicalPath
      : articleHrefForScope(scope, 'articles', slug)

  return (
    <>
      {articleJsonLdNodes({
        locked: isLocked(article),
        headline: article.title,
        existing: article.seoSection?.structuredData,
      }).map((node, index) => (
        <JsonLd key={index} data={node} />
      ))}
      <JsonLd data={buildArticleBreadcrumbJsonLd({ path, articleTitle: article.title })} />
      <ArticlePage article={article} path={path} />
    </>
  )
}

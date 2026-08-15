import { notFound, permanentRedirect } from 'next/navigation'
import { JsonLd } from '@/components/seo/JsonLd'
import { ArticlePage } from '@/features/articles/ArticlePage'
import { isStandardArticle } from '@/features/articles/lib/articleGuards'
import { buildArticleBreadcrumbJsonLd } from '@/features/articles/lib/articleBreadcrumbJsonLd'
import { articleJsonLdNodes } from '@/features/articles/lib/paywallJsonLd'
import { isLocked } from '@/features/articles/lib/gate'
import {
  fetchArticleByCanonicalPath,
  fetchRedirectByPath,
} from '@/features/articles/lib/fetchArticleByCanonicalPath'

type Params = {
  path: string
  lang?: string
}

export async function renderStandardArticleByPath({ path, lang }: Params) {
  const article = await fetchArticleByCanonicalPath({ path, lang })

  if (article && isStandardArticle(article)) {
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

  const redirect = await fetchRedirectByPath(path)
  if (redirect) {
    permanentRedirect(redirect.newPath)
  }

  notFound()
}

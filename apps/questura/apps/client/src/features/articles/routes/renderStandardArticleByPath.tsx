import { notFound, permanentRedirect } from 'next/navigation'
import { JsonLd } from '@/components/seo/JsonLd'
import { ArticlePage } from '@/features/articles/ArticlePage'
import { isStandardArticle } from '@/features/articles/lib/articleGuards'
import { buildArticleBreadcrumbJsonLd } from '@/features/articles/lib/articleBreadcrumbJsonLd'
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
        <JsonLd data={article.seoSection?.structuredData} />
        <JsonLd data={buildArticleBreadcrumbJsonLd({ path, articleTitle: article.title })} />
        <ArticlePage article={article} />
      </>
    )
  }

  const redirect = await fetchRedirectByPath(path)
  if (redirect) {
    permanentRedirect(redirect.newPath)
  }

  notFound()
}

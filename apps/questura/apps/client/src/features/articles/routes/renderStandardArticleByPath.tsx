import { notFound, permanentRedirect } from 'next/navigation'
import { ArticlePage } from '@/features/articles/ArticlePage'
import { isStandardArticle } from '@/features/articles/lib/articleGuards'
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
    return <ArticlePage article={article} />
  }

  const redirect = await fetchRedirectByPath(path)
  if (redirect) {
    permanentRedirect(redirect.newPath)
  }

  notFound()
}

import { SavedArticlesPage, type SavedArticlesPageConfig } from '../../blogArticles'
import { deleteArticle, fetchArticles, type Url2BlogSavedArticle } from '../api'
import '../articles.css'

function buildStageUrl(article: Url2BlogSavedArticle): string {
  return `/url2blog/stage-article?${new URLSearchParams({
    runId: article.run_id,
    title: article.title || 'Untitled',
    type: article.article_type || '',
  }).toString()}`
}

const config: SavedArticlesPageConfig<Url2BlogSavedArticle> = {
  featureKey: 'url2blog',
  storageKey: 'url2blog_staged_articles_v2',
  classNames: {
    savedLayout: 'u2b-saved-layout',
    statusNote: 'u2b-status-note',
  },
  heroActions: [
    { label: 'Back to Pipeline', to: '/url2blog', variant: 'secondary' },
  ],
  fetchArticles,
  deleteArticle,
  buildStageUrl,
  buildDraftUrl: (stagedId) => `/url2blog/stage-article?stagedId=${encodeURIComponent(stagedId)}`,
}

export default function ArticlesPage() {
  return <SavedArticlesPage config={config} />
}

import { SavedArticlesPage, type SavedArticlesPageConfig } from '../../blogArticles'
import { deleteArticle, fetchArticles, type SavedArticle } from '../api'

function buildStageUrl(article: SavedArticle): string {
  return `/youtube2blog/stage-article?${new URLSearchParams({
    runId: article.run_id,
    title: article.title || 'Untitled',
    type: article.article_type || '',
  }).toString()}`
}

const config: SavedArticlesPageConfig<SavedArticle> = {
  featureKey: 'youtube2blog',
  storageKey: 'youtube2blog_staged_articles_v2',
  classNames: {
    savedLayout: 'y2b-saved-layout',
    statusNote: 'y2b-status-note',
  },
  heroActions: [
    { label: 'Back to Pipeline', to: '/youtube2blog', variant: 'secondary' },
    { label: 'Article Types', to: '/youtube2blog/article-types', variant: 'secondary' },
  ],
  fetchArticles,
  deleteArticle,
  buildStageUrl,
  buildDraftUrl: (stagedId) => `/youtube2blog/stage-article?stagedId=${encodeURIComponent(stagedId)}`,
}

export default function ArticlesPage() {
  return <SavedArticlesPage config={config} />
}

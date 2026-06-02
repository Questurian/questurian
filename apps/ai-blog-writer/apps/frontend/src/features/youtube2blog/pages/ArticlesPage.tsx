import {
  buildStageArticleUrl,
  SavedArticlesPage,
  type SavedArticlesPageConfig
} from '../../blogArticles'
import { deleteArticle, fetchArticles, type SavedArticle } from '../api'

const config: SavedArticlesPageConfig<SavedArticle> = {
  featureKey: 'youtube2blog',
  storageKey: 'youtube2blog_staged_articles_v2',
  classNames: {
    savedLayout: 'y2b-saved-layout',
    statusNote: 'y2b-status-note'
  },
  heroActions: [
    { label: 'Back to Pipeline', to: '/youtube2blog', variant: 'secondary' },
    {
      label: 'Article Types',
      to: '/youtube2blog/article-types',
      variant: 'secondary'
    }
  ],
  fetchArticles,
  deleteArticle,
  buildStageUrl: (article) => buildStageArticleUrl('youtube2blog', article),
  buildDraftUrl: (stagedId) =>
    `/youtube2blog/stage-article?stagedId=${encodeURIComponent(stagedId)}`
}

export default function ArticlesPage() {
  return <SavedArticlesPage config={config} />
}

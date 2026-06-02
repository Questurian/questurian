import {
  buildStageArticleUrl,
  SavedArticlesPage,
  type SavedArticlesPageConfig
} from '../../blogArticles'
import {
  deleteArticle,
  fetchArticles,
  type Prompt2BlogSavedArticle
} from '../api'
import '../articles.css'

const config: SavedArticlesPageConfig<Prompt2BlogSavedArticle> = {
  featureKey: 'prompt2blog',
  storageKey: 'prompt2blog_staged_articles_v2',
  classNames: {
    savedLayout: 'p2b-saved-layout',
    statusNote: 'p2b-status-note'
  },
  heroActions: [
    { label: 'Back to Pipeline', to: '/prompt2blog', variant: 'secondary' }
  ],
  fetchArticles,
  deleteArticle,
  buildStageUrl: (article) => buildStageArticleUrl('prompt2blog', article),
  buildDraftUrl: (stagedId) =>
    `/prompt2blog/stage-article?stagedId=${encodeURIComponent(stagedId)}`
}

export default function ArticlesPage() {
  return <SavedArticlesPage config={config} />
}

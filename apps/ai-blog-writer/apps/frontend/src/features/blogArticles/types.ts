export type SavedBlogArticle = {
  run_id: string
  title: string | null
  article_type: string | null
  created_at: string
  updated_at: string
  markdown: string
  markdown_length: number
  synced_to_payload?: boolean
  payload_article_id?: number | null
  synced_at?: string | null
}

export type SavedArticlesHeroAction = {
  label: string
  to: string
  variant?: 'primary' | 'secondary'
}

export type SavedArticlesPageConfig<TArticle extends SavedBlogArticle> = {
  featureKey: string
  storageKey: string
  classNames: {
    savedLayout: string
    statusNote: string
  }
  heroActions: SavedArticlesHeroAction[]
  fetchArticles: () => Promise<TArticle[]>
  deleteArticle: (runId: string) => Promise<unknown>
  buildStageUrl: (article: TArticle) => string
  buildDraftUrl: (stagedId: string) => string
}

export function buildStageArticleUrl(
  prefix: string,
  article: Pick<SavedBlogArticle, 'run_id' | 'title' | 'article_type'>
): string {
  return `/${prefix}/stage-article?${new URLSearchParams({
    runId: article.run_id,
    title: article.title || 'Untitled',
    type: article.article_type || ''
  }).toString()}`
}

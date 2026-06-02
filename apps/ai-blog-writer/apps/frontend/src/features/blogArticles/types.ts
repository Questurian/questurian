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

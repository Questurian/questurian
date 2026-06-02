import type { SavedBlogArticle } from '../../blogArticles'

export type Prompt2BlogSavedArticle = SavedBlogArticle

export type Prompt2BlogSyncStatusResponse = {
  synced_to_payload: boolean
  payload_article_id: number | null
  synced_at: string | null
}

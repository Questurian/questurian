import type { SavedBlogArticle } from '../../blogArticles'

export type Url2BlogSavedArticle = SavedBlogArticle

export type Url2BlogSyncStatusResponse = {
  synced_to_payload: boolean
  payload_article_id: number | null
  synced_at: string | null
}

import type { SavedBlogArticle } from '../../blogArticles'

export type SavedArticle = SavedBlogArticle

export type SyncStatusResponse = {
  synced_to_payload: boolean
  payload_article_id: number | null
  synced_at: string | null
}

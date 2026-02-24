export type Prompt2BlogSavedArticle = {
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

export type Prompt2BlogSyncStatusResponse = {
  synced_to_payload: boolean
  payload_article_id: number | null
  synced_at: string | null
}

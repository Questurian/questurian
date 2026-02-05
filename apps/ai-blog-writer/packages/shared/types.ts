export type UploadResponse = {
  run_id?: string
  run_ids?: string[]
  batch_id?: string
  message?: string
}

export type StatusResponse = {
  run_id: string
  stage: string
  state: 'pending' | 'running' | 'completed' | 'failed'
  updated_at: string
  error?: string | null
  evaluation_metrics?: Record<string, number> | null
}

export type ResultResponse = {
  run_id: string
  markdown: string
  artifact: Record<string, unknown>
}

export type ArticleType = {
  id: number
  name: string
  definition: string
  guideline: string | null
  title_guideline: string | null
  created_at: string
  updated_at: string
}

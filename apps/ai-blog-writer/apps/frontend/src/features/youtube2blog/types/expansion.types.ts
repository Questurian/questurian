export type ListicleDetectionResponse = {
  is_listicle: boolean
  list_type: string | null
  list_topic: string | null
  detected_items: string[]
}

export type ExpandGap = {
  type: string
  topic: string
  reason: string
  suggested_section_title: string
}

export type ExpandStatusResponse = {
  run_id: string
  state: 'running' | 'completed' | 'failed'
  stage: 'analyzing' | 'expanding' | 'completed' | 'error'
  updated_at: string
  error?: string | null
}

export type ExpandResultResponse = {
  expanded_article: string
  gaps: ExpandGap[]
  expansion_plan: string
}

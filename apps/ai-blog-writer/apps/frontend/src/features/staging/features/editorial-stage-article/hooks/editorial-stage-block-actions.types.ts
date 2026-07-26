import type { Dispatch, SetStateAction } from 'react'
import type { StagedArticle } from '../../../types'
import type { EditorModelName } from '../types'
import type { TimelineItem } from '../workflow.service'

export type PublishResult = { success: boolean; message: string } | null

export type UpdateStagedArticle = (updates: Partial<StagedArticle>) => void

export type SetPublishResult = Dispatch<SetStateAction<PublishResult>>

export type RewriteBlockWithAi = (input: {
  prompt: string
  blockContent: string
  modelName?: EditorModelName
  articleTitle?: string
  articleContext?: string
}) => Promise<{ rewritten_content: string }>

export type UseEditorialStageBlocksParams = {
  stagedArticle: StagedArticle | null
  timelineItems: TimelineItem[]
  updateStagedArticle: UpdateStagedArticle
  setPublishResult: SetPublishResult
  setActiveEditingTimelineItemId: Dispatch<SetStateAction<string | null>>
  rewriteBlockWithAi: RewriteBlockWithAi
}

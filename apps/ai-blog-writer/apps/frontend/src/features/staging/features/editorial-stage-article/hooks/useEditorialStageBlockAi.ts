import { useCallback } from 'react'
import type { StagedArticle } from '../../../types'
import { resolveEditorModelName } from '../constants'
import { buildAiArticleContext, type TimelineItem } from '../workflow.service'
import type { RewriteBlockWithAi } from './editorial-stage-block-actions.types'

type UseEditorialStageBlockAiParams = {
  stagedArticle: StagedArticle | null
  timelineItems: TimelineItem[]
  rewriteBlockWithAi: RewriteBlockWithAi
}

export function useEditorialStageBlockAi({
  stagedArticle,
  timelineItems,
  rewriteBlockWithAi
}: UseEditorialStageBlockAiParams) {
  const rewriteTextBlockWithAi = useCallback(
    async (
      blockId: string,
      currentContent: string,
      prompt: string,
      includeWholeArticleContext: boolean
    ): Promise<string> => {
      if (!stagedArticle) {
        throw new Error('Stage article is not loaded yet.')
      }

      const targetBlock = stagedArticle.blocks.find(
        (block) => block.id === blockId
      )
      if (!targetBlock || targetBlock.type !== 'text') {
        throw new Error('AI rewrite is only available for text blocks.')
      }

      const articleTitle =
        stagedArticle.title.trim() ||
        stagedArticle.originalTitle.trim() ||
        'Untitled article'
      const articleContext = includeWholeArticleContext
        ? buildAiArticleContext(
            timelineItems,
            stagedArticle.blocks,
            stagedArticle.editorialBlocks || []
          )
        : undefined
      const response = await rewriteBlockWithAi({
        prompt,
        blockContent: currentContent,
        modelName: resolveEditorModelName(stagedArticle.editorModelName),
        articleTitle,
        articleContext
      })
      const rewrittenContent = response.rewritten_content?.trim()

      if (!rewrittenContent) {
        throw new Error('AI returned empty block content.')
      }

      return rewrittenContent
    },
    [rewriteBlockWithAi, stagedArticle, timelineItems]
  )

  return { rewriteTextBlockWithAi }
}

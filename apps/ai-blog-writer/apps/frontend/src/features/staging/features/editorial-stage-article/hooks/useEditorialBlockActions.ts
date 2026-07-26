import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { EditorialBlock, StagedArticle } from '../../../types'
import type { SupportedEditorialComponent } from '../types'
import { buildDefaultEditorialTemplate } from '../editorial-markdown.service'
import {
  repairEditorialBlock,
  replaceEditorialBlockMarkdown
} from '../editorial-markdown/editorial-block-editing'
import { getEditorialTimelineItemId } from '../workflow.service'
import type {
  SetPublishResult,
  UpdateStagedArticle
} from './editorial-stage-block-actions.types'

type UseEditorialBlockActionsParams = {
  stagedArticle: StagedArticle | null
  updateStagedArticle: UpdateStagedArticle
  setPublishResult: SetPublishResult
  setActiveEditingTimelineItemId: Dispatch<SetStateAction<string | null>>
}

function createEditorialBlockId() {
  return `editorial_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function useEditorialBlockActions({
  stagedArticle,
  updateStagedArticle,
  setPublishResult,
  setActiveEditingTimelineItemId
}: UseEditorialBlockActionsParams) {
  const fixEditorialBlock = useCallback(
    (blockId: string) => {
      if (!stagedArticle) return

      const result = repairEditorialBlock(
        stagedArticle.editorialBlocks,
        blockId
      )
      if (!result) return
      if (result.status === 'unsupported') {
        setPublishResult({
          success: false,
          message: `Cannot auto-fix unsupported component "${result.component}" yet.`
        })
        return
      }

      updateStagedArticle({
        editorialBlocks: result.editorialBlocks,
        lexicalConverted: false
      })
      setPublishResult(null)
    },
    [setPublishResult, stagedArticle, updateStagedArticle]
  )

  const updateEditorialBlockMarkdown = useCallback(
    (blockId: string, nextMarkdown: string) => {
      if (!stagedArticle) return

      updateStagedArticle({
        editorialBlocks: replaceEditorialBlockMarkdown(
          stagedArticle.editorialBlocks,
          blockId,
          nextMarkdown
        ),
        lexicalConverted: false
      })
    },
    [stagedArticle, updateStagedArticle]
  )

  const removeEditorialBlock = useCallback(
    (blockId: string) => {
      if (!stagedArticle) return

      const target = stagedArticle.editorialBlocks.find(
        (block) => block.id === blockId
      )
      if (!target) return

      const blockLabel = target.label?.trim() || 'this editorial block'
      if (!confirm(`Remove "${blockLabel}"?`)) return

      updateStagedArticle({
        editorialBlocks: stagedArticle.editorialBlocks.filter(
          (block) => block.id !== blockId
        ),
        lexicalConverted: false
      })
      setPublishResult(null)
    },
    [setPublishResult, stagedArticle, updateStagedArticle]
  )

  const addNewEditorialBlock = useCallback(
    (component: SupportedEditorialComponent, afterBlockId?: string) => {
      if (!stagedArticle) return

      const { label, markdown } = buildDefaultEditorialTemplate(component)
      const validAfterBlockId =
        afterBlockId &&
        stagedArticle.blocks.some((block) => block.id === afterBlockId)
          ? afterBlockId
          : stagedArticle.blocks.length > 0
            ? stagedArticle.blocks[stagedArticle.blocks.length - 1].id
            : null

      const newEditorialBlock: EditorialBlock = {
        id: createEditorialBlockId(),
        component,
        label,
        markdown,
        afterBlockId: validAfterBlockId,
        placeAfterImage: false
      }

      updateStagedArticle({
        editorialBlocks: [...stagedArticle.editorialBlocks, newEditorialBlock],
        lexicalConverted: false
      })
      setActiveEditingTimelineItemId(
        getEditorialTimelineItemId(newEditorialBlock.id)
      )
      setPublishResult(null)
    },
    [
      setActiveEditingTimelineItemId,
      setPublishResult,
      stagedArticle,
      updateStagedArticle
    ]
  )

  return {
    fixEditorialBlock,
    updateEditorialBlockMarkdown,
    removeEditorialBlock,
    addNewEditorialBlock
  }
}

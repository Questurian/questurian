import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { ContentBlock, StagedArticle } from '../../../types'
import {
  findHeaderSplitPoints,
  insertContentBlock,
  mergeTextBlockWithNext,
  removeContentBlock,
  splitTextBlockAtLine
} from '../content-blocks/block-editing'
import {
  getBlockMediaPayload,
  getContentTimelineItemId,
  parseMarkdownToBlocks
} from '../workflow.service'
import type { UpdateStagedArticle } from './editorial-stage-block-actions.types'

type UseEditorialStageContentBlockActionsParams = {
  stagedArticle: StagedArticle | null
  updateStagedArticle: UpdateStagedArticle
  setActiveEditingTimelineItemId: Dispatch<SetStateAction<string | null>>
}

function createContentBlockId() {
  return `block_${Date.now()}`
}

export function useEditorialStageContentBlockActions({
  stagedArticle,
  updateStagedArticle,
  setActiveEditingTimelineItemId
}: UseEditorialStageContentBlockActionsParams) {
  const updateBlockContent = useCallback(
    (blockId: string, newContent: string) => {
      if (!stagedArticle) return

      updateStagedArticle({
        blocks: stagedArticle.blocks.map((block) =>
          block.id === blockId ? { ...block, content: newContent } : block
        ),
        lexicalConverted: false
      })
    },
    [stagedArticle, updateStagedArticle]
  )

  const mergeWithNextBlock = useCallback(
    (blockId: string) => {
      if (!stagedArticle) return

      const result = mergeTextBlockWithNext(
        stagedArticle.blocks,
        stagedArticle.editorialBlocks || [],
        blockId
      )
      if (!result) return

      updateStagedArticle({
        ...result,
        lexicalConverted: false
      })
    },
    [stagedArticle, updateStagedArticle]
  )

  const resetToOriginalBlocks = useCallback(() => {
    if (!stagedArticle) return
    if (
      !confirm(
        'Reset all blocks to the original content? This will remove any edits and images between blocks.'
      )
    )
      return

    updateStagedArticle({
      blocks: parseMarkdownToBlocks(stagedArticle.originalContent),
      lexicalConverted: false
    })
  }, [stagedArticle, updateStagedArticle])

  const splitBlockAtHeader = useCallback(
    (blockId: string, lineIndex: number) => {
      if (!stagedArticle) return

      const result = splitTextBlockAtLine(
        stagedArticle.blocks,
        stagedArticle.editorialBlocks || [],
        blockId,
        lineIndex,
        createContentBlockId
      )
      if (!result) return

      updateStagedArticle({
        ...result,
        lexicalConverted: false
      })
    },
    [stagedArticle, updateStagedArticle]
  )

  const addNewBlock = useCallback(
    (afterBlockId?: string) => {
      if (!stagedArticle) return

      const newBlock: ContentBlock = {
        id: createContentBlockId(),
        type: 'text',
        content: '## New Section\n\nAdd your content here...'
      }
      const updatedBlocks = insertContentBlock(
        stagedArticle.blocks,
        newBlock,
        afterBlockId
      )
      if (!updatedBlocks) return

      updateStagedArticle({
        blocks: updatedBlocks,
        lexicalConverted: false
      })
      setActiveEditingTimelineItemId(getContentTimelineItemId(newBlock.id))
    },
    [setActiveEditingTimelineItemId, stagedArticle, updateStagedArticle]
  )

  const deleteBlock = useCallback(
    (blockId: string) => {
      if (!stagedArticle) return
      if (stagedArticle.blocks.length <= 1) {
        alert('Cannot delete the last block.')
        return
      }

      const block = stagedArticle.blocks.find(
        (candidate) => candidate.id === blockId
      )
      if (!block) return

      const message = getBlockMediaPayload(block)
        ? 'Delete this block and its media block?'
        : 'Delete this block?'
      if (!confirm(message)) return

      const result = removeContentBlock(
        stagedArticle.blocks,
        stagedArticle.editorialBlocks || [],
        blockId
      )
      if (!result) return

      updateStagedArticle({
        ...result,
        lexicalConverted: false
      })
    },
    [stagedArticle, updateStagedArticle]
  )

  return {
    updateBlockContent,
    mergeWithNextBlock,
    resetToOriginalBlocks,
    findHeaderSplitPoints,
    splitBlockAtHeader,
    addNewBlock,
    deleteBlock
  }
}

import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { MediaAsset } from '../../../api'
import type { ContentBlock, EditorialBlock, StagedArticle } from '../../../types'
import type { EditorModelName } from '../types'
import {
  getEditorialComponentDefaultLabel,
  resolveEditorModelName,
} from '../constants'
import {
  buildDefaultEditorialTemplate,
  normalizeEditorialComponentKey,
  validateEditorialBlockForPublish,
} from '../editorial-markdown.service'
import {
  buildAiArticleContext,
  createImgPairBlock,
  createImgTrioBlock,
  createSingleImageBlock,
  getBlockMediaPayload,
  getContentTimelineItemId,
  getEditorialTimelineItemId,
  isTextualBlock,
  parseMarkdownToBlocks,
  type TimelineItem,
} from '../workflow.service'
import type { ImgTrioFormat, SupportedEditorialComponent } from '../types'

type PublishResult = { success: boolean; message: string } | null

type UseEditorialStageBlocksParams = {
  stagedArticle: StagedArticle | null
  timelineItems: TimelineItem[]
  updateStagedArticle: (updates: Partial<StagedArticle>) => void
  setPublishResult: Dispatch<SetStateAction<PublishResult>>
  setActiveEditingTimelineItemId: Dispatch<SetStateAction<string | null>>
  rewriteBlockWithAi: (input: {
    prompt: string
    blockContent: string
    modelName?: EditorModelName
    articleTitle?: string
    articleContext?: string
  }) => Promise<{ rewritten_content: string }>
}

function createMediaBlockId() {
  return `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function useEditorialStageBlocks({
  stagedArticle,
  timelineItems,
  updateStagedArticle,
  setPublishResult,
  setActiveEditingTimelineItemId,
  rewriteBlockWithAi,
}: UseEditorialStageBlocksParams) {
  const fixEditorialBlock = useCallback((blockId: string) => {
    if (!stagedArticle) return

    const target = stagedArticle.editorialBlocks.find((block) => block.id === blockId)
    if (!target) return

    const validation = validateEditorialBlockForPublish(target)
    if (validation.status === 'unsupported') {
      setPublishResult({
        success: false,
        message: `Cannot auto-fix unsupported component "${target.component}" yet.`,
      })
      return
    }

    const startMatch = validation.correctedMarkdown.match(/\[!EDITORIAL-BLOCK-START\|([^\]]+)\]/i)
    const labelMatch = validation.correctedMarkdown.match(/\[!EDITORIAL-BLOCK-LABEL\|([^\]]+)\]/i)
    const correctedComponent = startMatch
      ? normalizeEditorialComponentKey(startMatch[1])
      : normalizeEditorialComponentKey(target.component)
    const defaultLabel = getEditorialComponentDefaultLabel(correctedComponent)
    const correctedLabel = labelMatch?.[1]?.trim() || target.label || defaultLabel

    const updatedEditorialBlocks = stagedArticle.editorialBlocks.map((block) =>
      block.id === blockId
        ? {
            ...block,
            component: correctedComponent,
            label: correctedLabel,
            markdown: validation.correctedMarkdown,
          }
        : block
    )

    updateStagedArticle({
      editorialBlocks: updatedEditorialBlocks,
      lexicalConverted: false,
    })
    setPublishResult(null)
  }, [setPublishResult, stagedArticle, updateStagedArticle])

  const updateEditorialBlockMarkdown = useCallback((blockId: string, nextMarkdown: string) => {
    if (!stagedArticle) return

    const updatedEditorialBlocks = stagedArticle.editorialBlocks.map((block) => {
      if (block.id !== blockId) return block

      const startMatch = nextMarkdown.match(/^\s*>\s*\[!EDITORIAL-BLOCK-START\|([^\]]+)\]\s*$/im)
      const labelMatch = nextMarkdown.match(/^\s*>\s*\[!EDITORIAL-BLOCK-LABEL\|([^\]]+)\]\s*$/im)

      return {
        ...block,
        component: startMatch
          ? normalizeEditorialComponentKey(startMatch[1]) || block.component
          : block.component,
        label: labelMatch?.[1]?.trim() || block.label,
        markdown: nextMarkdown,
      }
    })

    updateStagedArticle({
      editorialBlocks: updatedEditorialBlocks,
      lexicalConverted: false,
    })
  }, [stagedArticle, updateStagedArticle])

  const removeEditorialBlock = useCallback((blockId: string) => {
    if (!stagedArticle) return

    const target = stagedArticle.editorialBlocks.find((block) => block.id === blockId)
    if (!target) return

    const blockLabel = target.label?.trim() || 'this editorial block'
    if (!confirm(`Remove "${blockLabel}"?`)) return

    const updatedEditorialBlocks = stagedArticle.editorialBlocks.filter(
      (block) => block.id !== blockId
    )

    updateStagedArticle({
      editorialBlocks: updatedEditorialBlocks,
      lexicalConverted: false,
    })
    setPublishResult(null)
  }, [setPublishResult, stagedArticle, updateStagedArticle])

  const updateBlockContent = useCallback((blockId: string, newContent: string) => {
    if (!stagedArticle) return
    const updatedBlocks = stagedArticle.blocks.map((block) =>
      block.id === blockId ? { ...block, content: newContent } : block
    )
    updateStagedArticle({ blocks: updatedBlocks, lexicalConverted: false })
  }, [stagedArticle, updateStagedArticle])

  const rewriteTextBlockWithAi = useCallback(async (
    blockId: string,
    currentContent: string,
    prompt: string,
    includeWholeArticleContext: boolean
  ): Promise<string> => {
    if (!stagedArticle) {
      throw new Error('Stage article is not loaded yet.')
    }

    const targetBlock = stagedArticle.blocks.find((block) => block.id === blockId)
    if (!targetBlock || targetBlock.type !== 'text') {
      throw new Error('AI rewrite is only available for text blocks.')
    }

    const articleTitle = (
      stagedArticle.title.trim()
      || stagedArticle.originalTitle.trim()
      || 'Untitled article'
    )
    const articleContext = includeWholeArticleContext
      ? buildAiArticleContext(
          timelineItems,
          stagedArticle.blocks,
          stagedArticle.editorialBlocks || []
        )
      : undefined
    const modelName = resolveEditorModelName(stagedArticle.editorModelName)
    const response = await rewriteBlockWithAi({
      prompt,
      blockContent: currentContent,
      modelName,
      articleTitle,
      articleContext,
    })
    const rewrittenContent = response.rewritten_content?.trim()

    if (!rewrittenContent) {
      throw new Error('AI returned empty block content.')
    }

    return rewrittenContent
  }, [rewriteBlockWithAi, stagedArticle, timelineItems])

  const reanchorEditorialBlocksAfterBlockRemoval = useCallback((
    removedBlockId: string,
    fallbackAfterBlockId: string | null
  ): EditorialBlock[] => {
    if (!stagedArticle) return []

    return (stagedArticle.editorialBlocks || []).map((editorialBlock) => {
      if (editorialBlock.afterBlockId !== removedBlockId) {
        return editorialBlock
      }

      return {
        ...editorialBlock,
        afterBlockId: fallbackAfterBlockId,
        placeAfterImage: false,
      }
    })
  }, [stagedArticle])

  const addImageAfterBlock = useCallback((
    blockId: string,
    imageId: number,
    imageAfterAltText?: string,
    replaceExisting = false
  ): string | null => {
    if (!stagedArticle) return null
    const blockIndex = stagedArticle.blocks.findIndex((block) => block.id === blockId)
    if (blockIndex === -1) {
      if (replaceExisting) {
        return null
      }

      const fallbackBlockId = createMediaBlockId()
      const fallbackImageBlock = createSingleImageBlock(
        fallbackBlockId,
        imageId,
        imageAfterAltText
      )
      updateStagedArticle({
        blocks: [...stagedArticle.blocks, fallbackImageBlock],
      })
      return fallbackBlockId
    }
    const targetBlock = stagedArticle.blocks[blockIndex]

    if (replaceExisting && targetBlock.type === 'image') {
      const updatedBlocks = stagedArticle.blocks.map((block) =>
        block.id === blockId
          ? createSingleImageBlock(blockId, imageId, imageAfterAltText)
          : block
      )
      updateStagedArticle({ blocks: updatedBlocks })
      return blockId
    }

    const newImageBlock = createSingleImageBlock(
      createMediaBlockId(),
      imageId,
      imageAfterAltText
    )
    const updatedBlocks = [
      ...stagedArticle.blocks.slice(0, blockIndex + 1),
      newImageBlock,
      ...stagedArticle.blocks.slice(blockIndex + 1),
    ]
    updateStagedArticle({ blocks: updatedBlocks })
    return newImageBlock.id
  }, [stagedArticle, updateStagedArticle])

  const addImgPairAfterBlock = useCallback((
    blockId: string,
    imageOne: MediaAsset,
    imageTwo: MediaAsset,
    caption?: string,
    replaceExisting = false
  ) => {
    if (!stagedArticle) return
    const blockIndex = stagedArticle.blocks.findIndex((block) => block.id === blockId)
    if (blockIndex === -1) return
    const targetBlock = stagedArticle.blocks[blockIndex]

    if (replaceExisting && targetBlock.type === 'img-pair') {
      const updatedBlocks = stagedArticle.blocks.map((block) =>
        block.id === blockId
          ? createImgPairBlock(
              blockId,
              imageOne.id,
              imageTwo.id,
              caption
            )
          : block
      )
      updateStagedArticle({ blocks: updatedBlocks })
      return
    }

    const newPairBlock = createImgPairBlock(
      createMediaBlockId(),
      imageOne.id,
      imageTwo.id,
      caption
    )
    const updatedBlocks = [
      ...stagedArticle.blocks.slice(0, blockIndex + 1),
      newPairBlock,
      ...stagedArticle.blocks.slice(blockIndex + 1),
    ]
    updateStagedArticle({ blocks: updatedBlocks })
  }, [stagedArticle, updateStagedArticle])

  const addImgTrioAfterBlock = useCallback((
    blockId: string,
    format: ImgTrioFormat,
    imageOne: MediaAsset,
    imageTwo: MediaAsset,
    imageThree: MediaAsset,
    caption?: string,
    replaceExisting = false
  ) => {
    if (!stagedArticle) return
    const blockIndex = stagedArticle.blocks.findIndex((block) => block.id === blockId)
    if (blockIndex === -1) return
    const targetBlock = stagedArticle.blocks[blockIndex]

    if (replaceExisting && targetBlock.type === 'img-trio') {
      const updatedBlocks = stagedArticle.blocks.map((block) =>
        block.id === blockId
          ? createImgTrioBlock(
              blockId,
              format,
              imageOne.id,
              imageTwo.id,
              imageThree.id,
              caption
            )
          : block
      )
      updateStagedArticle({ blocks: updatedBlocks })
      return
    }

    const newTrioBlock = createImgTrioBlock(
      createMediaBlockId(),
      format,
      imageOne.id,
      imageTwo.id,
      imageThree.id,
      caption
    )
    const updatedBlocks = [
      ...stagedArticle.blocks.slice(0, blockIndex + 1),
      newTrioBlock,
      ...stagedArticle.blocks.slice(blockIndex + 1),
    ]
    updateStagedArticle({ blocks: updatedBlocks })
  }, [stagedArticle, updateStagedArticle])

  const updateMediaGroupCaption = useCallback((blockId: string, caption: string) => {
    if (!stagedArticle) return

    const updatedBlocks = stagedArticle.blocks.map((block) => {
      if (block.id !== blockId) return block
      if (block.type === 'img-pair' && block.imgPairAfter) {
        return createImgPairBlock(
          block.id,
          block.imgPairAfter.imageOne,
          block.imgPairAfter.imageTwo,
          caption
        )
      }
      if (block.type === 'img-trio' && block.imgTrioAfter) {
        return createImgTrioBlock(
          block.id,
          block.imgTrioAfter.format,
          block.imgTrioAfter.imageOne,
          block.imgTrioAfter.imageTwo,
          block.imgTrioAfter.imageThree,
          caption
        )
      }
      if (block.imgPairAfter) {
        return {
          ...block,
          imgPairAfter: {
            ...block.imgPairAfter,
            caption: caption || undefined,
          },
        }
      }
      if (block.imgTrioAfter) {
        return {
          ...block,
          imgTrioAfter: {
            ...block.imgTrioAfter,
            caption: caption || undefined,
          },
        }
      }
      return block
    })

    updateStagedArticle({ blocks: updatedBlocks })
  }, [stagedArticle, updateStagedArticle])

  const removeImageAfterBlock = useCallback((blockId: string) => {
    if (!stagedArticle) return
    const removedIndex = stagedArticle.blocks.findIndex((block) => block.id === blockId)
    const targetBlock = stagedArticle.blocks.find((block) => block.id === blockId)
    if (targetBlock?.type === 'image') {
      const fallbackAfterBlockId = removedIndex > 0
        ? stagedArticle.blocks[removedIndex - 1].id
        : null
      const updatedEditorialBlocks = reanchorEditorialBlocksAfterBlockRemoval(
        blockId,
        fallbackAfterBlockId
      )
      updateStagedArticle({
        blocks: stagedArticle.blocks.filter((block) => block.id !== blockId),
        editorialBlocks: updatedEditorialBlocks,
      })
      return
    }
    const updatedBlocks = stagedArticle.blocks.map((block) =>
      block.id === blockId ? { ...block, imageAfter: undefined, imageAfterAltText: undefined } : block
    )
    updateStagedArticle({ blocks: updatedBlocks })
  }, [reanchorEditorialBlocksAfterBlockRemoval, stagedArticle, updateStagedArticle])

  const removeImgPairAfterBlock = useCallback((blockId: string) => {
    if (!stagedArticle) return
    const removedIndex = stagedArticle.blocks.findIndex((block) => block.id === blockId)
    const targetBlock = stagedArticle.blocks.find((block) => block.id === blockId)
    if (targetBlock?.type === 'img-pair') {
      const fallbackAfterBlockId = removedIndex > 0
        ? stagedArticle.blocks[removedIndex - 1].id
        : null
      const updatedEditorialBlocks = reanchorEditorialBlocksAfterBlockRemoval(
        blockId,
        fallbackAfterBlockId
      )
      updateStagedArticle({
        blocks: stagedArticle.blocks.filter((block) => block.id !== blockId),
        editorialBlocks: updatedEditorialBlocks,
      })
      return
    }
    const updatedBlocks = stagedArticle.blocks.map((block) =>
      block.id === blockId ? { ...block, imgPairAfter: undefined } : block
    )
    updateStagedArticle({ blocks: updatedBlocks })
  }, [reanchorEditorialBlocksAfterBlockRemoval, stagedArticle, updateStagedArticle])

  const removeImgTrioAfterBlock = useCallback((blockId: string) => {
    if (!stagedArticle) return
    const removedIndex = stagedArticle.blocks.findIndex((block) => block.id === blockId)
    const targetBlock = stagedArticle.blocks.find((block) => block.id === blockId)
    if (targetBlock?.type === 'img-trio') {
      const fallbackAfterBlockId = removedIndex > 0
        ? stagedArticle.blocks[removedIndex - 1].id
        : null
      const updatedEditorialBlocks = reanchorEditorialBlocksAfterBlockRemoval(
        blockId,
        fallbackAfterBlockId
      )
      updateStagedArticle({
        blocks: stagedArticle.blocks.filter((block) => block.id !== blockId),
        editorialBlocks: updatedEditorialBlocks,
      })
      return
    }
    const updatedBlocks = stagedArticle.blocks.map((block) =>
      block.id === blockId ? { ...block, imgTrioAfter: undefined } : block
    )
    updateStagedArticle({ blocks: updatedBlocks })
  }, [reanchorEditorialBlocksAfterBlockRemoval, stagedArticle, updateStagedArticle])

  const mergeWithNextBlock = useCallback((blockId: string) => {
    if (!stagedArticle) return
    const blockIndex = stagedArticle.blocks.findIndex((block) => block.id === blockId)
    if (blockIndex === -1 || blockIndex >= stagedArticle.blocks.length - 1) return

    const currentBlock = stagedArticle.blocks[blockIndex]
    const nextBlock = stagedArticle.blocks[blockIndex + 1]

    if (!isTextualBlock(currentBlock) || !isTextualBlock(nextBlock)) return

    const mergedBlock: ContentBlock = {
      id: currentBlock.id,
      type: currentBlock.type === 'pullquote' ? 'pullquote' : 'text',
      content: `${currentBlock.content}\n\n${nextBlock.content}`,
    }

    const updatedBlocks = [
      ...stagedArticle.blocks.slice(0, blockIndex),
      mergedBlock,
      ...stagedArticle.blocks.slice(blockIndex + 2),
    ]

    const updatedEditorialBlocks = (stagedArticle.editorialBlocks || []).map((editorialBlock) => {
      if (editorialBlock.afterBlockId !== nextBlock.id) {
        return editorialBlock
      }

      return {
        ...editorialBlock,
        afterBlockId: currentBlock.id,
      }
    })

    updateStagedArticle({
      blocks: updatedBlocks,
      editorialBlocks: updatedEditorialBlocks,
      lexicalConverted: false,
    })
  }, [stagedArticle, updateStagedArticle])

  const resetToOriginalBlocks = useCallback(() => {
    if (!stagedArticle) return
    if (!confirm('Reset all blocks to the original content? This will remove any edits and images between blocks.')) return

    const blocks = parseMarkdownToBlocks(stagedArticle.originalContent)
    updateStagedArticle({
      blocks,
      lexicalConverted: false,
    })
  }, [stagedArticle, updateStagedArticle])

  const findHeaderSplitPoints = useCallback((content: string): { lineIndex: number; headerText: string }[] => {
    const lines = content.split('\n')
    const splitPoints: { lineIndex: number; headerText: string }[] = []

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index]
      if (/^#{1,6}\s/.test(line) && index > 0) {
        splitPoints.push({ lineIndex: index, headerText: line.replace(/^#+\s*/, '') })
      }
    }

    return splitPoints
  }, [])

  const splitBlockAtHeader = useCallback((blockId: string, lineIndex: number) => {
    if (!stagedArticle) return

    const blockIndex = stagedArticle.blocks.findIndex((block) => block.id === blockId)
    if (blockIndex === -1) return

    const block = stagedArticle.blocks[blockIndex]
    if (!isTextualBlock(block)) return
    const lines = block.content.split('\n')
    const secondBlockId = `block_${Date.now()}`

    const beforeContent = lines.slice(0, lineIndex).join('\n').trim()
    const afterContent = lines.slice(lineIndex).join('\n').trim()

    if (!beforeContent || !afterContent) return

    const newBlocks: ContentBlock[] = [
      {
        id: block.id,
        type: block.type === 'pullquote' ? 'pullquote' : 'text',
        content: beforeContent,
      },
      {
        id: secondBlockId,
        type: block.type === 'pullquote' ? 'pullquote' : 'text',
        content: afterContent,
      },
    ]

    const updatedBlocks = [
      ...stagedArticle.blocks.slice(0, blockIndex),
      ...newBlocks,
      ...stagedArticle.blocks.slice(blockIndex + 1),
    ]

    const updatedEditorialBlocks = (stagedArticle.editorialBlocks || []).map((editorialBlock) => {
      if (editorialBlock.afterBlockId !== block.id) {
        return editorialBlock
      }

      return {
        ...editorialBlock,
        afterBlockId: secondBlockId,
      }
    })

    updateStagedArticle({
      blocks: updatedBlocks,
      editorialBlocks: updatedEditorialBlocks,
      lexicalConverted: false,
    })
  }, [stagedArticle, updateStagedArticle])

  const addNewBlock = useCallback((afterBlockId?: string) => {
    if (!stagedArticle) return

    const newBlock: ContentBlock = {
      id: `block_${Date.now()}`,
      type: 'text',
      content: '## New Section\n\nAdd your content here...',
    }

    let updatedBlocks: ContentBlock[]

    if (afterBlockId) {
      const blockIndex = stagedArticle.blocks.findIndex((block) => block.id === afterBlockId)
      if (blockIndex === -1) return
      updatedBlocks = [
        ...stagedArticle.blocks.slice(0, blockIndex + 1),
        newBlock,
        ...stagedArticle.blocks.slice(blockIndex + 1),
      ]
    } else {
      updatedBlocks = [...stagedArticle.blocks, newBlock]
    }

    updateStagedArticle({ blocks: updatedBlocks, lexicalConverted: false })
    setActiveEditingTimelineItemId(getContentTimelineItemId(newBlock.id))
  }, [setActiveEditingTimelineItemId, stagedArticle, updateStagedArticle])

  const addNewEditorialBlock = useCallback((
    component: SupportedEditorialComponent,
    afterBlockId?: string
  ) => {
    if (!stagedArticle) return

    const { label, markdown } = buildDefaultEditorialTemplate(component)
    const validAfterBlockId = afterBlockId
      && stagedArticle.blocks.some((block) => block.id === afterBlockId)
      ? afterBlockId
      : stagedArticle.blocks.length > 0
        ? stagedArticle.blocks[stagedArticle.blocks.length - 1].id
        : null

    const newEditorialBlock: EditorialBlock = {
      id: `editorial_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      component,
      label,
      markdown,
      afterBlockId: validAfterBlockId,
      placeAfterImage: false,
    }

    updateStagedArticle({
      editorialBlocks: [...stagedArticle.editorialBlocks, newEditorialBlock],
      lexicalConverted: false,
    })
    setActiveEditingTimelineItemId(getEditorialTimelineItemId(newEditorialBlock.id))
    setPublishResult(null)
  }, [setActiveEditingTimelineItemId, setPublishResult, stagedArticle, updateStagedArticle])

  const deleteBlock = useCallback((blockId: string) => {
    if (!stagedArticle) return
    if (stagedArticle.blocks.length <= 1) {
      alert('Cannot delete the last block.')
      return
    }

    const block = stagedArticle.blocks.find((candidate) => candidate.id === blockId)
    if (!block) return

    const hasMedia = Boolean(getBlockMediaPayload(block))
    const message = hasMedia
      ? 'Delete this block and its media block?'
      : 'Delete this block?'

    if (!confirm(message)) return

    const removedIndex = stagedArticle.blocks.findIndex((candidate) => candidate.id === blockId)
    const fallbackAfterBlockId = removedIndex > 0
      ? stagedArticle.blocks[removedIndex - 1].id
      : null
    const updatedBlocks = stagedArticle.blocks.filter((candidate) => candidate.id !== blockId)
    const updatedEditorialBlocks = reanchorEditorialBlocksAfterBlockRemoval(
      blockId,
      fallbackAfterBlockId
    )
    updateStagedArticle({
      blocks: updatedBlocks,
      editorialBlocks: updatedEditorialBlocks,
      lexicalConverted: false,
    })
  }, [reanchorEditorialBlocksAfterBlockRemoval, stagedArticle, updateStagedArticle])

  return {
    fixEditorialBlock,
    updateEditorialBlockMarkdown,
    removeEditorialBlock,
    updateBlockContent,
    rewriteTextBlockWithAi,
    addImageAfterBlock,
    addImgPairAfterBlock,
    addImgTrioAfterBlock,
    updateMediaGroupCaption,
    removeImageAfterBlock,
    removeImgPairAfterBlock,
    removeImgTrioAfterBlock,
    mergeWithNextBlock,
    resetToOriginalBlocks,
    findHeaderSplitPoints,
    splitBlockAtHeader,
    addNewBlock,
    addNewEditorialBlock,
    deleteBlock,
  }
}

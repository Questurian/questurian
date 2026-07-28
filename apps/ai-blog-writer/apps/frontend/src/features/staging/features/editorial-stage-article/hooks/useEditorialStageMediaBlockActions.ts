import { useCallback } from 'react'
import type { MediaAsset } from '../../../api'
import type { StagedArticle } from '../../../types'
import { createStagedId } from '../create-staged-id'
import {
  removeMediaBlock,
  updateMediaGroupBlockCaption
} from '../content-blocks/media-block-editing'
import {
  insertOrReplaceImgPairBlock,
  insertOrReplaceImgTrioBlock,
  insertOrReplaceSingleImageBlock
} from '../content-blocks/media-block-insertion'
import type { ImgTrioFormat } from '../types'
import type { UpdateStagedArticle } from './editorial-stage-block-actions.types'

type UseEditorialStageMediaBlockActionsParams = {
  stagedArticle: StagedArticle | null
  updateStagedArticle: UpdateStagedArticle
}

function createMediaBlockId() {
  return createStagedId('media')
}

export function useEditorialStageMediaBlockActions({
  stagedArticle,
  updateStagedArticle
}: UseEditorialStageMediaBlockActionsParams) {
  const addImageAfterBlock = useCallback(
    (
      blockId: string,
      imageId: number,
      imageAfterAltText?: string,
      replaceExisting = false
    ): string | null => {
      if (!stagedArticle) return null

      const result = insertOrReplaceSingleImageBlock(
        stagedArticle.blocks,
        blockId,
        createMediaBlockId,
        imageId,
        imageAfterAltText,
        replaceExisting
      )
      if (!result) return null

      updateStagedArticle({ blocks: result.blocks })
      return result.insertedBlockId
    },
    [stagedArticle, updateStagedArticle]
  )

  const addImgPairAfterBlock = useCallback(
    (
      blockId: string,
      imageOne: MediaAsset,
      imageTwo: MediaAsset,
      caption?: string,
      replaceExisting = false
    ) => {
      if (!stagedArticle) return

      const blocks = insertOrReplaceImgPairBlock(
        stagedArticle.blocks,
        blockId,
        createMediaBlockId,
        imageOne,
        imageTwo,
        caption,
        replaceExisting
      )
      if (!blocks) return
      updateStagedArticle({ blocks })
    },
    [stagedArticle, updateStagedArticle]
  )

  const addImgTrioAfterBlock = useCallback(
    (
      blockId: string,
      format: ImgTrioFormat,
      imageOne: MediaAsset,
      imageTwo: MediaAsset,
      imageThree: MediaAsset,
      caption?: string,
      replaceExisting = false
    ) => {
      if (!stagedArticle) return

      const blocks = insertOrReplaceImgTrioBlock(
        stagedArticle.blocks,
        blockId,
        createMediaBlockId,
        format,
        imageOne,
        imageTwo,
        imageThree,
        caption,
        replaceExisting
      )
      if (!blocks) return
      updateStagedArticle({ blocks })
    },
    [stagedArticle, updateStagedArticle]
  )

  const updateMediaGroupCaption = useCallback(
    (blockId: string, caption: string) => {
      if (!stagedArticle) return

      updateStagedArticle({
        blocks: updateMediaGroupBlockCaption(
          stagedArticle.blocks,
          blockId,
          caption
        )
      })
    },
    [stagedArticle, updateStagedArticle]
  )

  const removeImageAfterBlock = useCallback(
    (blockId: string) => {
      if (!stagedArticle) return

      updateStagedArticle(
        removeMediaBlock(
          stagedArticle.blocks,
          stagedArticle.editorialBlocks || [],
          blockId,
          'image'
        )
      )
    },
    [stagedArticle, updateStagedArticle]
  )

  const removeImgPairAfterBlock = useCallback(
    (blockId: string) => {
      if (!stagedArticle) return

      updateStagedArticle(
        removeMediaBlock(
          stagedArticle.blocks,
          stagedArticle.editorialBlocks || [],
          blockId,
          'img-pair'
        )
      )
    },
    [stagedArticle, updateStagedArticle]
  )

  const removeImgTrioAfterBlock = useCallback(
    (blockId: string) => {
      if (!stagedArticle) return

      updateStagedArticle(
        removeMediaBlock(
          stagedArticle.blocks,
          stagedArticle.editorialBlocks || [],
          blockId,
          'img-trio'
        )
      )
    },
    [stagedArticle, updateStagedArticle]
  )

  return {
    addImageAfterBlock,
    addImgPairAfterBlock,
    addImgTrioAfterBlock,
    updateMediaGroupCaption,
    removeImageAfterBlock,
    removeImgPairAfterBlock,
    removeImgTrioAfterBlock
  }
}

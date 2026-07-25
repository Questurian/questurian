import {
  useCallback,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from 'react'
import type { EditorialStageArticleApi } from '../types'
import { getImageTimelineItemId } from '../workflow.service'
import type { EditorialStageArticleWorkspace } from './useEditorialStageArticleWorkspace'
import { useEditorialStageMedia } from './useEditorialStageMedia'

type UseEditorialStageArticleMediaControllerParams = {
  token: string | null | undefined
  api: EditorialStageArticleApi
  workspace: EditorialStageArticleWorkspace
}

export function useEditorialStageArticleMediaController({
  token,
  api,
  workspace,
}: UseEditorialStageArticleMediaControllerParams) {
  const media = useEditorialStageMedia({
    token,
    stagedArticle: workspace.page.stagedArticle,
    locations: workspace.page.locations,
    mediaAssets: workspace.page.mediaAssets,
    mergeMediaAssetsIntoState: workspace.page.mergeMediaAssetsIntoState,
    fetchMediaAssets: api.fetchMediaAssets,
    fetchExternalImageSource: api.fetchExternalImageSource,
    searchPexelsImages: api.searchPexelsImages,
    searchUnsplashImages: api.searchUnsplashImages,
    updateStagedArticle: workspace.page.updateStagedArticle,
    setPublishResult: workspace.setPublishResult,
    setActiveEditingTimelineItemId: workspace.timeline.setActiveEditingTimelineItemId,
    getImageTimelineItemId,
    addImageAfterBlock: workspace.blocks.addImageAfterBlock,
    clearOpenImagePickerTarget: () => workspace.dispatchUi({ type: 'CLOSE_IMAGE_PICKER' }),
  })
  const { dispatchUi } = workspace
  const { showImageModal, setShowImageModal } = media.featured
  const {
    blockImageModal,
    openBlockImageModal,
    closeBlockImageModal,
  } = media.block

  useEffect(() => {
    dispatchUi({
      type: 'SYNC_MODAL_FLAGS',
      featuredOpen: showImageModal,
      blockOpen: Boolean(blockImageModal?.show),
      cropOpen: false,
    })
  }, [
    showImageModal,
    blockImageModal?.show,
    dispatchUi,
  ])

  const setShowImageModalTracked: Dispatch<SetStateAction<boolean>> = useCallback((next) => {
    const resolved = typeof next === 'function'
      ? next(showImageModal)
      : next
    setShowImageModal(resolved)
  }, [showImageModal, setShowImageModal])

  const openBlockImageModalTracked = useCallback((
    blockId: string,
    mode: Parameters<typeof openBlockImageModal>[1],
    options?: Parameters<typeof openBlockImageModal>[2],
  ) => {
    openBlockImageModal(blockId, mode, options)
  }, [openBlockImageModal])

  const closeBlockImageModalTracked = useCallback(() => {
    closeBlockImageModal()
  }, [closeBlockImageModal])

  return {
    ...media,
    setShowImageModalTracked,
    openBlockImageModalTracked,
    closeBlockImageModalTracked,
  }
}

export type EditorialStageArticleMediaController = ReturnType<
  typeof useEditorialStageArticleMediaController
>

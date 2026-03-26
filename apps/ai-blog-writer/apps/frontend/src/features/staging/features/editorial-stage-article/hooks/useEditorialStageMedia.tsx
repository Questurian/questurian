import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { type UploadImageResponse } from '../../../../../features/images'
import {
  type UploadProgress,
  uploadImageVariants,
} from '../../../../../features/images/api/imagesApi'
import type { ImageVariantType } from '../../../../../features/images/utils/imageProcessing'
import type {
  ExternalImageProvider,
  Location,
  MediaAsset,
  PexelsPhoto,
  UnsplashPhoto,
} from '../../../api'
import type { StagedArticle } from '../../../types'
import type {
  BlockImageModalMode,
  ExternalImageCropContext,
  ExternalImageCropDraft,
  ImgTrioFormat,
  MediaVariant,
} from '../types'
import {
  CONTENT_BLOCK_VARIANT,
  FEATURED_IMAGE_HEIGHT,
  FEATURED_IMAGE_VARIANT,
  FEATURED_IMAGE_WIDTH,
  IMG_BLOCK_VARIANT,
  IMG_PAIR_REQUIRED_IMAGE_COUNT,
  IMG_TRIO_DEFAULT_FORMAT,
  IMG_TRIO_REQUIRED_IMAGE_COUNT,
  UPLOAD_LOCATION_REQUIREMENT_MESSAGE,
} from '../constants'
import {
  buildExternalAltText,
  buildExternalImportRef,
  buildExternalPhotographerCredit,
  buildImageFileNamePrefix,
  getPexelsPhotoImportUrl,
  getUnsplashPhotoImportUrl,
  pickVariantAssetId,
} from '../media-utils'
import { useEditorialStageFeaturedMedia } from './useEditorialStageFeaturedMedia'
import { useEditorialStageBlockMedia } from './useEditorialStageBlockMedia'

type PublishResult = { success: boolean; message: string } | null
const FEATURED_PAYLOAD_PAGE_LIMIT = 50

type UseEditorialStageMediaParams = {
  token: string | null | undefined
  stagedArticle: StagedArticle | null
  locations: Location[]
  mediaAssets: MediaAsset[]
  mergeMediaAssetsIntoState: (assets: MediaAsset[]) => void
  fetchMediaAssets: (
    token?: string,
    params?: {
      limit?: number
      page?: number
      mimeType?: string
      minWidth?: number
      minHeight?: number
      width?: number
      height?: number
      id?: number
    }
  ) => Promise<{ docs: MediaAsset[]; totalDocs: number; totalPages: number }>
  fetchExternalImageSource: (
    input: {
      sourceUrl: string
      provider: ExternalImageProvider
      photoId?: string | number
    },
    token: string
  ) => Promise<{
    blob: Blob
    fileName: string
    contentType: string
  }>
  searchPexelsImages: (
    query: string,
    params?: {
      perPage?: number
      page?: number
      orientation?: 'landscape' | 'portrait' | 'square'
    }
  ) => Promise<{ photos: PexelsPhoto[] }>
  searchUnsplashImages: (
    query: string,
    params?: {
      perPage?: number
      page?: number
      orientation?: 'landscape' | 'portrait' | 'square'
    }
  ) => Promise<{ photos: UnsplashPhoto[] }>
  updateStagedArticle: (updates: Partial<StagedArticle>) => void
  setPublishResult: Dispatch<SetStateAction<PublishResult>>
  setActiveEditingTimelineItemId: Dispatch<SetStateAction<string | null>>
  getImageTimelineItemId: (blockId: string) => string
  addImageAfterBlock: (
    blockId: string,
    imageId: number,
    imageAfterAltText?: string,
    replaceExisting?: boolean
  ) => string | null
  clearOpenImagePickerTarget: () => void
}

export function useEditorialStageMedia({
  token,
  stagedArticle,
  locations,
  mediaAssets,
  mergeMediaAssetsIntoState,
  fetchMediaAssets,
  fetchExternalImageSource,
  searchPexelsImages,
  searchUnsplashImages,
  updateStagedArticle,
  setPublishResult,
  setActiveEditingTimelineItemId,
  getImageTimelineItemId,
  addImageAfterBlock,
  clearOpenImagePickerTarget,
}: UseEditorialStageMediaParams) {
  const [externalImageCropDraft, setExternalImageCropDraft] = useState<ExternalImageCropDraft | null>(null)
  const [externalImageCropError, setExternalImageCropError] = useState<string | null>(null)
  const [externalImageUploadProgress, setExternalImageUploadProgress] = useState<UploadProgress | null>(null)
  const [isUploadingExternalImageVariants, setIsUploadingExternalImageVariants] = useState(false)
  const [featuredPayloadPage, setFeaturedPayloadPage] = useState(0)
  const [featuredPayloadTotalPages, setFeaturedPayloadTotalPages] = useState(1)
  const [isLoadingFeaturedPayloadAssets, setIsLoadingFeaturedPayloadAssets] = useState(false)
  const [featuredPayloadAssetsError, setFeaturedPayloadAssetsError] = useState<string | null>(null)

  const resetExternalImportState = useCallback(() => {
    setExternalImageCropDraft(null)
    setExternalImageCropError(null)
    setExternalImageUploadProgress(null)
    setIsUploadingExternalImageVariants(false)
  }, [])

  const block = useEditorialStageBlockMedia({
    token,
    mediaAssets,
    fetchMediaAssets,
    searchPexelsImages,
    searchUnsplashImages,
    clearOpenImagePickerTarget,
    resetExternalImportState,
  })

  const refreshMediaAssets = useCallback(async () => {
    if (!token) return
    const response = await fetchMediaAssets(token, { limit: 50, mimeType: 'image/' })
    mergeMediaAssetsIntoState(response.docs || [])
    block.mergeMediaAssetsIntoState(response.docs || [])
  }, [token, fetchMediaAssets, mergeMediaAssetsIntoState, block])

  useEffect(() => {
    if (!token || !stagedArticle?.featuredImageId) return

    const featuredAssetId = Number(stagedArticle.featuredImageId)
    if (!Number.isFinite(featuredAssetId) || featuredAssetId <= 0) return
    if (mediaAssets.some((asset) => asset.id === featuredAssetId)) return

    let isCancelled = false

    const hydrateFeaturedAsset = async () => {
      try {
        const response = await fetchMediaAssets(token, {
          limit: 1,
          id: featuredAssetId,
        })
        if (isCancelled) return
        mergeMediaAssetsIntoState(response.docs || [])
        block.mergeMediaAssetsIntoState(response.docs || [])
      } catch {
        // Keep UI fallback in place if this targeted hydration fails.
      }
    }

    void hydrateFeaturedAsset()

    return () => {
      isCancelled = true
    }
  }, [token, stagedArticle?.featuredImageId, mediaAssets, fetchMediaAssets, mergeMediaAssetsIntoState, block])

  const featured = useEditorialStageFeaturedMedia({
    stagedArticleId: stagedArticle?.id ?? 'staged-article',
    articleTitle: stagedArticle?.title ?? 'Featured Image',
    searchPexelsImages,
    searchUnsplashImages,
    resetExternalImportState,
  })

  const loadMoreFeaturedPayloadAssets = useCallback(async () => {
    if (!token) return
    if (isLoadingFeaturedPayloadAssets) return
    if (featuredPayloadPage >= featuredPayloadTotalPages) return

    const nextPage = featuredPayloadPage + 1

    try {
      setIsLoadingFeaturedPayloadAssets(true)
      setFeaturedPayloadAssetsError(null)
      const response = await fetchMediaAssets(token, {
        limit: FEATURED_PAYLOAD_PAGE_LIMIT,
        page: nextPage,
        mimeType: 'image/',
        width: FEATURED_IMAGE_WIDTH,
        height: FEATURED_IMAGE_HEIGHT,
      })

      const docs = response.docs || []
      mergeMediaAssetsIntoState(docs)
      setFeaturedPayloadPage(nextPage)
      setFeaturedPayloadTotalPages(response.totalPages || featuredPayloadTotalPages)
    } catch (error) {
      setFeaturedPayloadAssetsError(
        error instanceof Error
          ? error.message
          : 'Failed to load featured images from Payload.'
      )
    } finally {
      setIsLoadingFeaturedPayloadAssets(false)
    }
  }, [
    token,
    isLoadingFeaturedPayloadAssets,
    featuredPayloadPage,
    featuredPayloadTotalPages,
    fetchMediaAssets,
    mergeMediaAssetsIntoState,
  ])

  useEffect(() => {
    if (!featured.showImageModal) return
    if (featured.featuredImageSource !== 'payload') return
    if (featuredPayloadPage > 0) return

    void loadMoreFeaturedPayloadAssets()
  }, [
    featured.showImageModal,
    featured.featuredImageSource,
    featuredPayloadPage,
    loadMoreFeaturedPayloadAssets,
  ])

  useEffect(() => {
    if (featured.showImageModal && featured.featuredImageSource === 'payload') return
    setFeaturedPayloadAssetsError(null)
  }, [featured.showImageModal, featured.featuredImageSource])

  const refreshModalImgBlockAssets = useCallback(async (
    mode: BlockImageModalMode,
    trioFormat: ImgTrioFormat
  ) => {
    if (!token || mode === 'default') return
    void trioFormat
    await block.reloadImgBlockAssets()
  }, [token, block])

  const handleUploadComplete = useCallback((result: UploadImageResponse) => {
    const featuredAssetId = pickVariantAssetId(result.variantAssetIds, FEATURED_IMAGE_VARIANT)
    if (featuredAssetId) {
      updateStagedArticle({ featuredImageId: featuredAssetId })
    }

    void refreshMediaAssets()

    featured.setFeaturedImageSource('payload')
    featured.setShowImageModal(false)
    featured.setImageAltText('')
    featured.setImagePhotographerCredit('')
  }, [featured, refreshMediaAssets, updateStagedArticle])

  const handleBlockImageUploadComplete = useCallback((result: UploadImageResponse) => {
    if (!block.blockImageModal) return
    if (block.blockImageModal.mode !== 'default') {
      block.setBlockImageSource('payload')
      return
    }

    const blockAssetId = pickVariantAssetId(result.variantAssetIds, CONTENT_BLOCK_VARIANT)
    if (blockAssetId) {
      const addedBlockId = addImageAfterBlock(
        block.blockImageModal.blockId,
        blockAssetId,
        block.blockImageAltText,
        block.blockImageModal.replaceExistingBlock === true
      )
      if (!addedBlockId) {
        setPublishResult({
          success: false,
          message: 'Could not add the image block. Try selecting the target position again.',
        })
        return
      }

      setActiveEditingTimelineItemId(getImageTimelineItemId(addedBlockId))
    }

    void refreshMediaAssets()

    block.closeBlockImageModal()
    block.setBlockImageAltText('')
    block.setBlockImagePhotographerCredit('')
  }, [
    addImageAfterBlock,
    block,
    getImageTimelineItemId,
    refreshMediaAssets,
    setActiveEditingTimelineItemId,
    setPublishResult,
  ])

  const applyExternalUploadResult = useCallback(async (
    result: UploadImageResponse,
    draft: ExternalImageCropDraft
  ) => {
    if (draft.context === 'featured') {
      const featuredAssetId = pickVariantAssetId(result.variantAssetIds, FEATURED_IMAGE_VARIANT)
      if (!featuredAssetId) {
        throw new Error('Imported image is missing an editorial (4:3) variant.')
      }

      updateStagedArticle({ featuredImageId: featuredAssetId })
      await refreshMediaAssets()
      featured.setFeaturedImageSource('payload')
      featured.setShowImageModal(false)
      return
    }

    if (!draft.blockId) {
      throw new Error('Block target is missing for external image import.')
    }

    if (draft.blockMode === 'img' || draft.blockMode === 'img-trio') {
      const requiredImageCount = draft.blockMode === 'img-trio'
        ? IMG_TRIO_REQUIRED_IMAGE_COUNT
        : IMG_PAIR_REQUIRED_IMAGE_COUNT
      const trioFormat = draft.trioFormat || IMG_TRIO_DEFAULT_FORMAT
      const selectionVariant: MediaVariant =
        draft.blockMode === 'img'
          ? IMG_BLOCK_VARIANT
          : trioFormat === 'square'
            ? 'square'
            : CONTENT_BLOCK_VARIANT

      const selectedAssetId = pickVariantAssetId(result.variantAssetIds, selectionVariant)
      if (!selectedAssetId) {
        throw new Error(
          draft.blockMode === 'img'
            ? 'Imported image is missing a portrait (4:5) variant for img pair.'
            : `Imported image is missing a ${trioFormat} variant for img trio.`
        )
      }

      await refreshModalImgBlockAssets(draft.blockMode, trioFormat)
      block.setSelectedImgBlockAssetIds((current) => {
        if (current.includes(selectedAssetId)) return current
        if (current.length >= requiredImageCount) {
          return [...current.slice(1), selectedAssetId]
        }
        return [...current, selectedAssetId]
      })
      return
    }

    const blockAssetId = pickVariantAssetId(result.variantAssetIds, CONTENT_BLOCK_VARIANT)
    if (!blockAssetId) {
      throw new Error('Imported image is missing a wide (16:9) variant.')
    }

    const addedBlockId = addImageAfterBlock(
      draft.blockId,
      blockAssetId,
      draft.altText,
      draft.replaceExistingBlock === true
    )
    if (!addedBlockId) {
      throw new Error('Could not add the imported image block.')
    }

    setActiveEditingTimelineItemId(getImageTimelineItemId(addedBlockId))
    await refreshMediaAssets()
    block.closeBlockImageModal()
  }, [
    addImageAfterBlock,
    block,
    featured,
    getImageTimelineItemId,
    refreshMediaAssets,
    refreshModalImgBlockAssets,
    setActiveEditingTimelineItemId,
    updateStagedArticle,
  ])

  const handleUploadExternalCroppedVariants = useCallback(async (
    variantFiles: Array<{ type: ImageVariantType; file: File }>
  ) => {
    if (!externalImageCropDraft) return
    if (!token) {
      throw new Error('Please sign in again before importing images.')
    }

    const location = locations.find((loc) => loc.id === stagedArticle?.locationId)
    if (!location) {
      throw new Error(UPLOAD_LOCATION_REQUIREMENT_MESSAGE)
    }

    if (!externalImageCropDraft.photographerCredit.trim()) {
      throw new Error('Photographer credit is required before importing.')
    }

    setIsUploadingExternalImageVariants(true)
    setExternalImageCropError(null)

    try {
      const result = await uploadImageVariants(
        variantFiles,
        externalImageCropDraft.externalRef,
        externalImageCropDraft.altText,
        location.id,
        token,
        externalImageCropDraft.photographerCredit,
        (progress) => setExternalImageUploadProgress(progress)
      )
      await applyExternalUploadResult(result, externalImageCropDraft)
      resetExternalImportState()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload external image variants'
      setExternalImageCropError(message)
    } finally {
      setIsUploadingExternalImageVariants(false)
      featured.setIsImportingFeaturedExternalImage(false)
      block.setIsImportingBlockExternalImage(false)
    }
  }, [
    applyExternalUploadResult,
    block,
    externalImageCropDraft,
    featured,
    locations,
    resetExternalImportState,
    stagedArticle?.locationId,
    token,
  ])

  const prepareExternalImageCropDraft = useCallback(async (
    photo: UnsplashPhoto | PexelsPhoto,
    provider: ExternalImageProvider,
    context: ExternalImageCropContext,
  ) => {
    if (!stagedArticle) return

    if (context === 'featured') {
      if (provider === 'unsplash') featured.setUnsplashFeaturedError(null)
      if (provider === 'pexels') featured.setPexelsFeaturedError(null)
      featured.setIsImportingFeaturedExternalImage(true)
    } else {
      if (provider === 'unsplash') block.setUnsplashBlockError(null)
      if (provider === 'pexels') block.setPexelsBlockError(null)
      block.setIsImportingBlockExternalImage(true)
    }

    if (!token) {
      const message = 'Please sign in again before importing images.'
      if (context === 'featured') {
        if (provider === 'unsplash') featured.setUnsplashFeaturedError(message)
        if (provider === 'pexels') featured.setPexelsFeaturedError(message)
      } else {
        if (provider === 'unsplash') block.setUnsplashBlockError(message)
        if (provider === 'pexels') block.setPexelsBlockError(message)
      }
      featured.setIsImportingFeaturedExternalImage(false)
      block.setIsImportingBlockExternalImage(false)
      return
    }

    const location = locations.find((loc) => loc.id === stagedArticle.locationId)
    if (!location) {
      if (context === 'featured') {
        if (provider === 'unsplash') featured.setUnsplashFeaturedError(UPLOAD_LOCATION_REQUIREMENT_MESSAGE)
        if (provider === 'pexels') featured.setPexelsFeaturedError(UPLOAD_LOCATION_REQUIREMENT_MESSAGE)
      } else {
        if (provider === 'unsplash') block.setUnsplashBlockError(UPLOAD_LOCATION_REQUIREMENT_MESSAGE)
        if (provider === 'pexels') block.setPexelsBlockError(UPLOAD_LOCATION_REQUIREMENT_MESSAGE)
      }
      featured.setIsImportingFeaturedExternalImage(false)
      block.setIsImportingBlockExternalImage(false)
      return
    }

    if (context === 'block' && !block.blockImageModal) {
      setPublishResult({
        success: false,
        message: 'Image block target is not available. Re-open the image modal.',
      })
      block.setIsImportingBlockExternalImage(false)
      return
    }

    const sourceUrl = provider === 'unsplash'
      ? getUnsplashPhotoImportUrl(photo as UnsplashPhoto)
      : getPexelsPhotoImportUrl(photo as PexelsPhoto)
    const altText = buildExternalAltText(photo.alt, stagedArticle.title)
    const photographerCredit = buildExternalPhotographerCredit(photo.photographer, provider)
    const baseExternalRef = context === 'featured'
      ? `${stagedArticle.id}_featured`
      : `${stagedArticle.id}_block_${block.blockImageModal?.blockId || ''}`
    const externalRef = buildExternalImportRef(baseExternalRef, provider, photo.id)
    const fileNamePrefix = buildImageFileNamePrefix(stagedArticle.title, externalRef)

    try {
      setExternalImageCropError(null)
      setExternalImageUploadProgress({
        status: 'processing',
        progress: 20,
        message: 'Downloading source image...',
      })

      const externalSource = await fetchExternalImageSource(
        {
          sourceUrl,
          provider,
          photoId: photo.id,
        },
        token
      )

      const file = new File(
        [externalSource.blob],
        externalSource.fileName,
        {
          type: externalSource.contentType || externalSource.blob.type || 'image/jpeg',
        }
      )

      setExternalImageCropDraft({
        context,
        provider,
        sourceUrl,
        photoId: photo.id,
        file,
        externalRef,
        fileNamePrefix,
        altText,
        photographerCredit,
        blockId: context === 'block' ? block.blockImageModal?.blockId : undefined,
        replaceExistingBlock:
          context === 'block' ? block.blockImageModal?.replaceExistingBlock === true : false,
        blockMode: context === 'block' ? block.blockImageModal?.mode : undefined,
        trioFormat: context === 'block' ? block.imgTrioFormat : undefined,
      })
      setExternalImageUploadProgress(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to download external image'
      if (context === 'featured') {
        if (provider === 'unsplash') featured.setUnsplashFeaturedError(message)
        if (provider === 'pexels') featured.setPexelsFeaturedError(message)
      } else {
        if (provider === 'unsplash') block.setUnsplashBlockError(message)
        if (provider === 'pexels') block.setPexelsBlockError(message)
      }
      setExternalImageUploadProgress(null)
    } finally {
      featured.setIsImportingFeaturedExternalImage(false)
      block.setIsImportingBlockExternalImage(false)
    }
  }, [
    block,
    fetchExternalImageSource,
    featured,
    locations,
    setPublishResult,
    stagedArticle,
    token,
  ])

  const handleImportFeaturedExternalImage = useCallback(async (
    photo: UnsplashPhoto | PexelsPhoto,
    provider: ExternalImageProvider
  ) => {
    await prepareExternalImageCropDraft(photo, provider, 'featured')
  }, [prepareExternalImageCropDraft])

  const handleImportBlockExternalImage = useCallback(async (
    photo: UnsplashPhoto | PexelsPhoto,
    provider: ExternalImageProvider
  ) => {
    await prepareExternalImageCropDraft(photo, provider, 'block')
  }, [prepareExternalImageCropDraft])

  return {
    featured: {
      ...featured,
      hasMoreFeaturedPayloadAssets: featuredPayloadPage < featuredPayloadTotalPages,
      isLoadingFeaturedPayloadAssets,
      featuredPayloadAssetsError,
      loadMoreFeaturedPayloadAssets,
      handleImportFeaturedExternalImage,
      handleUploadComplete,
    },
    block: {
      ...block,
      handleImportBlockExternalImage,
      handleBlockImageUploadComplete,
    },
    externalImport: {
      externalImageCropDraft,
      setExternalImageCropDraft,
      externalImageCropError,
      setExternalImageCropError,
      externalImageUploadProgress,
      setExternalImageUploadProgress,
      isUploadingExternalImageVariants,
      setIsUploadingExternalImageVariants,
      handleUploadExternalCroppedVariants,
      resetExternalImportState,
    },
    shared: {
      findPreferredVariantAsset: block.findPreferredVariantAsset,
      mergeMediaAssetsIntoState: block.mergeMediaAssetsIntoState,
    },
  }
}

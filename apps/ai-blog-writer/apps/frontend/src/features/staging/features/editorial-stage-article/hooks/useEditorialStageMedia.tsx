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
  BlockImageModalState,
  ExternalImageCropContext,
  ExternalImageCropDraft,
  ImageSourceOption,
  ImgTrioFormat,
  MediaVariant,
  OpenBlockImageModalOptions,
  PexelsOrientationOption,
} from '../types'
import {
  CONTENT_BLOCK_VARIANT,
  FEATURED_IMAGE_VARIANT,
  IMG_BLOCK_MIN_HEIGHT,
  IMG_BLOCK_MIN_WIDTH,
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
  getImgTrioDimensions,
  getPexelsPhotoImportUrl,
  getRelationshipId,
  getUnsplashPhotoImportUrl,
  mergeMediaAssetLists,
  pickVariantAssetId,
} from '../media-utils'
import { searchExternalPhotos } from '../services/editorial-stage-image-search.service'

type PublishResult = { success: boolean; message: string } | null

type UseEditorialStageMediaParams = {
  token: string | null | undefined
  stagedArticle: StagedArticle | null
  locations: Location[]
  mediaAssets: MediaAsset[]
  fetchMediaAssets: (
    token?: string,
    params?: {
      limit?: number
      mimeType?: string
      minWidth?: number
      minHeight?: number
      width?: number
      height?: number
    }
  ) => Promise<{ docs: MediaAsset[]; totalDocs: number }>
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
  importExternalImage: (
    input: {
      sourceUrl: string
      provider: ExternalImageProvider
      externalRef: string
      altText: string
      photographerCredit: string
      locationRef: number
      photoId?: string | number
    },
    token: string
  ) => Promise<UploadImageResponse>
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
  fetchMediaAssets,
  fetchExternalImageSource,
  importExternalImage,
  searchPexelsImages,
  searchUnsplashImages,
  updateStagedArticle,
  setPublishResult,
  setActiveEditingTimelineItemId,
  getImageTimelineItemId,
  addImageAfterBlock,
  clearOpenImagePickerTarget,
}: UseEditorialStageMediaParams) {
  const [showImageModal, setShowImageModal] = useState(false)
  const [featuredImageSource, setFeaturedImageSource] = useState<ImageSourceOption>('payload')
  const [imageSearch, setImageSearch] = useState('')
  const [imageAltText, setImageAltText] = useState('')
  const [imagePhotographerCredit, setImagePhotographerCredit] = useState('')
  const [unsplashFeaturedQuery, setUnsplashFeaturedQuery] = useState('')
  const [unsplashFeaturedResults, setUnsplashFeaturedResults] = useState<UnsplashPhoto[]>([])
  const [isSearchingUnsplashFeatured, setIsSearchingUnsplashFeatured] = useState(false)
  const [unsplashFeaturedError, setUnsplashFeaturedError] = useState<string | null>(null)
  const [unsplashFeaturedOrientation, setUnsplashFeaturedOrientation] = useState<PexelsOrientationOption>('')
  const [unsplashFeaturedPerPage, setUnsplashFeaturedPerPage] = useState<number>(18)
  const [pexelsFeaturedQuery, setPexelsFeaturedQuery] = useState('')
  const [pexelsFeaturedResults, setPexelsFeaturedResults] = useState<PexelsPhoto[]>([])
  const [isSearchingPexelsFeatured, setIsSearchingPexelsFeatured] = useState(false)
  const [pexelsFeaturedError, setPexelsFeaturedError] = useState<string | null>(null)
  const [pexelsFeaturedOrientation, setPexelsFeaturedOrientation] = useState<PexelsOrientationOption>('')
  const [pexelsFeaturedPerPage, setPexelsFeaturedPerPage] = useState<number>(18)
  const [isImportingFeaturedExternalImage, setIsImportingFeaturedExternalImage] = useState(false)
  const [externalImageCropDraft, setExternalImageCropDraft] = useState<ExternalImageCropDraft | null>(null)
  const [externalImageCropError, setExternalImageCropError] = useState<string | null>(null)
  const [externalImageUploadProgress, setExternalImageUploadProgress] = useState<UploadProgress | null>(null)
  const [isUploadingExternalImageVariants, setIsUploadingExternalImageVariants] = useState(false)

  const [blockImageModal, setBlockImageModal] = useState<BlockImageModalState | null>(null)
  const [blockImageSource, setBlockImageSource] = useState<ImageSourceOption>('payload')
  const [blockImageSearch, setBlockImageSearch] = useState('')
  const [blockImageAltText, setBlockImageAltText] = useState('')
  const [blockImagePhotographerCredit, setBlockImagePhotographerCredit] = useState('')
  const [imgBlockAssets, setImgBlockAssets] = useState<MediaAsset[]>([])
  const [isLoadingImgBlockAssets, setIsLoadingImgBlockAssets] = useState(false)
  const [imgBlockAssetsError, setImgBlockAssetsError] = useState<string | null>(null)
  const [selectedImgBlockAssetIds, setSelectedImgBlockAssetIds] = useState<number[]>([])
  const [imgBlockCaption, setImgBlockCaption] = useState('')
  const [imgTrioFormat, setImgTrioFormat] = useState<ImgTrioFormat>(IMG_TRIO_DEFAULT_FORMAT)
  const [unsplashBlockQuery, setUnsplashBlockQuery] = useState('')
  const [unsplashBlockResults, setUnsplashBlockResults] = useState<UnsplashPhoto[]>([])
  const [isSearchingUnsplashBlock, setIsSearchingUnsplashBlock] = useState(false)
  const [unsplashBlockError, setUnsplashBlockError] = useState<string | null>(null)
  const [unsplashBlockOrientation, setUnsplashBlockOrientation] = useState<PexelsOrientationOption>('')
  const [unsplashBlockPerPage, setUnsplashBlockPerPage] = useState<number>(18)
  const [pexelsBlockQuery, setPexelsBlockQuery] = useState('')
  const [pexelsBlockResults, setPexelsBlockResults] = useState<PexelsPhoto[]>([])
  const [isSearchingPexelsBlock, setIsSearchingPexelsBlock] = useState(false)
  const [pexelsBlockError, setPexelsBlockError] = useState<string | null>(null)
  const [pexelsBlockOrientation, setPexelsBlockOrientation] = useState<PexelsOrientationOption>('')
  const [pexelsBlockPerPage, setPexelsBlockPerPage] = useState<number>(18)
  const [isImportingBlockExternalImage, setIsImportingBlockExternalImage] = useState(false)

  const mergeMediaAssetsIntoState = useCallback((assets: MediaAsset[]) => {
    setImgBlockAssets((existingAssets) => mergeMediaAssetLists(existingAssets, assets))
  }, [])

  const closeBlockImageModal = useCallback(() => {
    setBlockImageSource('payload')
    setBlockImageModal(null)
    setSelectedImgBlockAssetIds([])
    setImgBlockCaption('')
    setImgTrioFormat(IMG_TRIO_DEFAULT_FORMAT)
    setImgBlockAssetsError(null)
    setIsLoadingImgBlockAssets(false)
    setIsImportingBlockExternalImage(false)
    setPexelsBlockQuery('')
    setPexelsBlockResults([])
    setIsSearchingPexelsBlock(false)
    setPexelsBlockError(null)
    setPexelsBlockOrientation('')
    setPexelsBlockPerPage(18)
    setUnsplashBlockQuery('')
    setUnsplashBlockResults([])
    setIsSearchingUnsplashBlock(false)
    setUnsplashBlockError(null)
    setUnsplashBlockOrientation('')
    setUnsplashBlockPerPage(18)
    setExternalImageCropDraft(null)
    setExternalImageCropError(null)
    setExternalImageUploadProgress(null)
    setIsUploadingExternalImageVariants(false)
  }, [])

  const openBlockImageModal = useCallback((
    blockId: string,
    mode: BlockImageModalMode,
    options?: OpenBlockImageModalOptions
  ) => {
    setBlockImageSearch('')
    setBlockImageSource('payload')
    setSelectedImgBlockAssetIds(options?.selectedAssetIds || [])
    setImgBlockCaption(options?.caption || '')
    setImgTrioFormat(options?.trioFormat || IMG_TRIO_DEFAULT_FORMAT)
    setImgBlockAssetsError(null)
    setPexelsBlockQuery('')
    setPexelsBlockResults([])
    setIsSearchingPexelsBlock(false)
    setPexelsBlockError(null)
    setPexelsBlockOrientation('')
    setPexelsBlockPerPage(18)
    setUnsplashBlockQuery('')
    setUnsplashBlockResults([])
    setIsSearchingUnsplashBlock(false)
    setUnsplashBlockError(null)
    setUnsplashBlockOrientation('')
    setUnsplashBlockPerPage(18)
    setIsImportingBlockExternalImage(false)
    setExternalImageCropDraft(null)
    setExternalImageCropError(null)
    setExternalImageUploadProgress(null)
    setIsUploadingExternalImageVariants(false)
    clearOpenImagePickerTarget()
    setBlockImageModal({
      blockId,
      show: true,
      mode,
      replaceExistingBlock: options?.replaceExistingBlock === true,
    })
  }, [clearOpenImagePickerTarget])

  useEffect(() => {
    if (!blockImageModal || blockImageModal.mode === 'default') return
    if (!token) {
      setImgBlockAssets([])
      setSelectedImgBlockAssetIds([])
      return
    }

    const loadFilteredAssets = async () => {
      setIsLoadingImgBlockAssets(true)
      setImgBlockAssetsError(null)

      let width = IMG_BLOCK_MIN_WIDTH
      let height = IMG_BLOCK_MIN_HEIGHT
      if (blockImageModal.mode === 'img-trio') {
        const dims = getImgTrioDimensions(imgTrioFormat)
        width = dims.width
        height = dims.height
      }

      try {
        const response = await fetchMediaAssets(token, {
          limit: 200,
          mimeType: 'image/',
          width,
          height,
        })
        const docs = response.docs || []
        setImgBlockAssets(docs)
        const allowedAssetIds = new Set(docs.map((asset) => asset.id))
        const requiredCount = blockImageModal.mode === 'img-trio'
          ? IMG_TRIO_REQUIRED_IMAGE_COUNT
          : IMG_PAIR_REQUIRED_IMAGE_COUNT
        setSelectedImgBlockAssetIds((current) =>
          current
            .filter((id) => allowedAssetIds.has(id))
            .slice(0, requiredCount)
        )
      } catch (err) {
        setImgBlockAssets([])
        setSelectedImgBlockAssetIds([])
        setImgBlockAssetsError(
          err instanceof Error
            ? err.message
            : 'Failed to load filtered image assets'
        )
      } finally {
        setIsLoadingImgBlockAssets(false)
      }
    }

    void loadFilteredAssets()
  }, [blockImageModal, token, fetchMediaAssets, imgTrioFormat])

  useEffect(() => {
    if (showImageModal) return
    setFeaturedImageSource('payload')
    setIsImportingFeaturedExternalImage(false)
    setExternalImageCropDraft(null)
    setExternalImageCropError(null)
    setExternalImageUploadProgress(null)
    setIsUploadingExternalImageVariants(false)
    setPexelsFeaturedQuery('')
    setPexelsFeaturedResults([])
    setIsSearchingPexelsFeatured(false)
    setPexelsFeaturedError(null)
    setPexelsFeaturedOrientation('')
    setPexelsFeaturedPerPage(18)
    setUnsplashFeaturedQuery('')
    setUnsplashFeaturedResults([])
    setIsSearchingUnsplashFeatured(false)
    setUnsplashFeaturedError(null)
    setUnsplashFeaturedOrientation('')
    setUnsplashFeaturedPerPage(18)
    setImageAltText('')
    setImagePhotographerCredit('')
  }, [showImageModal])

  const toggleImgBlockAssetSelection = useCallback((
    assetId: number,
    requiredCount: number
  ) => {
    setSelectedImgBlockAssetIds((current) => {
      if (current.includes(assetId)) {
        return current.filter((id) => id !== assetId)
      }
      if (current.length >= requiredCount) {
        return [...current.slice(1), assetId]
      }
      return [...current, assetId]
    })
  }, [])

  const findPreferredVariantAsset = useCallback((assetId: number, preferredVariant: MediaVariant): MediaAsset | null => {
    const selectedAsset = mediaAssets.find((asset) => asset.id === assetId)
    if (!selectedAsset) return null

    const mediaSetId = getRelationshipId(selectedAsset.mediaSet)
    if (mediaSetId === null || !selectedAsset.variant) {
      return selectedAsset
    }

    const preferred = mediaAssets.find((asset) => {
      const candidateMediaSetId = getRelationshipId(asset.mediaSet)
      return candidateMediaSetId !== null
        && String(candidateMediaSetId) === String(mediaSetId)
        && asset.variant === preferredVariant
    })

    return preferred || selectedAsset
  }, [mediaAssets])

  const refreshMediaAssets = useCallback(async () => {
    if (!token) return
    const response = await fetchMediaAssets(token, { limit: 50, mimeType: 'image/' })
    mergeMediaAssetsIntoState(response.docs || [])
  }, [token, fetchMediaAssets, mergeMediaAssetsIntoState])

  const refreshModalImgBlockAssets = useCallback(async (
    mode: BlockImageModalMode,
    trioFormat: ImgTrioFormat
  ) => {
    if (!token || mode === 'default') return

    let width = IMG_BLOCK_MIN_WIDTH
    let height = IMG_BLOCK_MIN_HEIGHT
    if (mode === 'img-trio') {
      const dims = getImgTrioDimensions(trioFormat)
      width = dims.width
      height = dims.height
    }

    const response = await fetchMediaAssets(token, {
      limit: 200,
      mimeType: 'image/',
      width,
      height,
    })
    const docs = response.docs || []
    setImgBlockAssets(docs)
    mergeMediaAssetsIntoState(docs)
  }, [token, fetchMediaAssets, mergeMediaAssetsIntoState])

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
      setFeaturedImageSource('payload')
      setShowImageModal(false)
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
      setSelectedImgBlockAssetIds((current) => {
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
    closeBlockImageModal()
  }, [
    addImageAfterBlock,
    closeBlockImageModal,
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
      setExternalImageCropDraft(null)
      setExternalImageUploadProgress(null)
      setExternalImageCropError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload external image variants'
      setExternalImageCropError(message)
    } finally {
      setIsUploadingExternalImageVariants(false)
      setIsImportingFeaturedExternalImage(false)
      setIsImportingBlockExternalImage(false)
    }
  }, [
    applyExternalUploadResult,
    externalImageCropDraft,
    locations,
    stagedArticle?.locationId,
    token,
  ])

  const handleSkipCropExternalImport = useCallback(async () => {
    if (!externalImageCropDraft || !token) return
    const location = locations.find((loc) => loc.id === stagedArticle?.locationId)
    if (!location) {
      setExternalImageCropError(UPLOAD_LOCATION_REQUIREMENT_MESSAGE)
      return
    }

    if (!externalImageCropDraft.photographerCredit.trim()) {
      setExternalImageCropError('Photographer credit is required before importing.')
      return
    }

    setExternalImageCropError(null)
    setIsUploadingExternalImageVariants(true)
    setExternalImageUploadProgress({
      status: 'processing',
      progress: 40,
      message: 'Importing original image (auto-crop)...',
    })

    try {
      const result = await importExternalImage(
        {
          sourceUrl: externalImageCropDraft.sourceUrl,
          provider: externalImageCropDraft.provider,
          externalRef: externalImageCropDraft.externalRef,
          altText: externalImageCropDraft.altText,
          photographerCredit: externalImageCropDraft.photographerCredit,
          locationRef: location.id,
          photoId: externalImageCropDraft.photoId,
        },
        token
      )
      await applyExternalUploadResult(result, externalImageCropDraft)
      setExternalImageCropDraft(null)
      setExternalImageUploadProgress(null)
    } catch (err) {
      setExternalImageCropError(
        err instanceof Error ? err.message : 'Failed to import image'
      )
    } finally {
      setIsUploadingExternalImageVariants(false)
      setIsImportingFeaturedExternalImage(false)
      setIsImportingBlockExternalImage(false)
    }
  }, [
    applyExternalUploadResult,
    externalImageCropDraft,
    importExternalImage,
    locations,
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
      if (provider === 'unsplash') setUnsplashFeaturedError(null)
      if (provider === 'pexels') setPexelsFeaturedError(null)
      setIsImportingFeaturedExternalImage(true)
    } else {
      if (provider === 'unsplash') setUnsplashBlockError(null)
      if (provider === 'pexels') setPexelsBlockError(null)
      setIsImportingBlockExternalImage(true)
    }

    if (!token) {
      const message = 'Please sign in again before importing images.'
      if (context === 'featured') {
        if (provider === 'unsplash') setUnsplashFeaturedError(message)
        if (provider === 'pexels') setPexelsFeaturedError(message)
      } else {
        if (provider === 'unsplash') setUnsplashBlockError(message)
        if (provider === 'pexels') setPexelsBlockError(message)
      }
      setIsImportingFeaturedExternalImage(false)
      setIsImportingBlockExternalImage(false)
      return
    }

    const location = locations.find((loc) => loc.id === stagedArticle.locationId)
    if (!location) {
      if (context === 'featured') {
        if (provider === 'unsplash') setUnsplashFeaturedError(UPLOAD_LOCATION_REQUIREMENT_MESSAGE)
        if (provider === 'pexels') setPexelsFeaturedError(UPLOAD_LOCATION_REQUIREMENT_MESSAGE)
      } else {
        if (provider === 'unsplash') setUnsplashBlockError(UPLOAD_LOCATION_REQUIREMENT_MESSAGE)
        if (provider === 'pexels') setPexelsBlockError(UPLOAD_LOCATION_REQUIREMENT_MESSAGE)
      }
      setIsImportingFeaturedExternalImage(false)
      setIsImportingBlockExternalImage(false)
      return
    }

    if (context === 'block' && !blockImageModal) {
      setPublishResult({
        success: false,
        message: 'Image block target is not available. Re-open the image modal.',
      })
      setIsImportingBlockExternalImage(false)
      return
    }

    const sourceUrl = provider === 'unsplash'
      ? getUnsplashPhotoImportUrl(photo as UnsplashPhoto)
      : getPexelsPhotoImportUrl(photo as PexelsPhoto)
    const altText = buildExternalAltText(photo.alt, stagedArticle.title)
    const photographerCredit = buildExternalPhotographerCredit(photo.photographer, provider)
    const baseExternalRef = context === 'featured'
      ? `${stagedArticle.id}_featured`
      : `${stagedArticle.id}_block_${blockImageModal?.blockId || ''}`
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
        blockId: context === 'block' ? blockImageModal?.blockId : undefined,
        replaceExistingBlock:
          context === 'block' ? blockImageModal?.replaceExistingBlock === true : false,
        blockMode: context === 'block' ? blockImageModal?.mode : undefined,
        trioFormat: context === 'block' ? imgTrioFormat : undefined,
      })
      setExternalImageUploadProgress(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to download external image'
      if (context === 'featured') {
        if (provider === 'unsplash') setUnsplashFeaturedError(message)
        if (provider === 'pexels') setPexelsFeaturedError(message)
      } else {
        if (provider === 'unsplash') setUnsplashBlockError(message)
        if (provider === 'pexels') setPexelsBlockError(message)
      }
      setExternalImageUploadProgress(null)
    } finally {
      setIsImportingFeaturedExternalImage(false)
      setIsImportingBlockExternalImage(false)
    }
  }, [
    blockImageModal,
    fetchExternalImageSource,
    imgTrioFormat,
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

  const handleUploadComplete = useCallback((result: UploadImageResponse) => {
    const featuredAssetId = pickVariantAssetId(result.variantAssetIds, FEATURED_IMAGE_VARIANT)
    if (featuredAssetId) {
      updateStagedArticle({ featuredImageId: featuredAssetId })
    }

    void refreshMediaAssets()

    setFeaturedImageSource('payload')
    setShowImageModal(false)
    setImageAltText('')
    setImagePhotographerCredit('')
  }, [refreshMediaAssets, updateStagedArticle])

  const handleBlockImageUploadComplete = useCallback((result: UploadImageResponse) => {
    if (!blockImageModal) return
    if (blockImageModal.mode !== 'default') {
      setBlockImageSource('payload')
      return
    }

    const blockAssetId = pickVariantAssetId(result.variantAssetIds, CONTENT_BLOCK_VARIANT)
    if (blockAssetId) {
      const addedBlockId = addImageAfterBlock(
        blockImageModal.blockId,
        blockAssetId,
        blockImageAltText,
        blockImageModal.replaceExistingBlock === true
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

    closeBlockImageModal()
    setBlockImageAltText('')
    setBlockImagePhotographerCredit('')
  }, [
    addImageAfterBlock,
    blockImageAltText,
    blockImageModal,
    closeBlockImageModal,
    getImageTimelineItemId,
    refreshMediaAssets,
    setActiveEditingTimelineItemId,
    setPublishResult,
  ])

  const runFeaturedUnsplashSearch = useCallback(async () => {
    setIsSearchingUnsplashFeatured(true)
    setUnsplashFeaturedError(null)

    try {
      const photos = await searchExternalPhotos(
        searchUnsplashImages,
        unsplashFeaturedQuery,
        unsplashFeaturedPerPage,
        unsplashFeaturedOrientation
      )
      setUnsplashFeaturedResults(photos)
    } catch (err) {
      setUnsplashFeaturedResults([])
      setUnsplashFeaturedError(
        err instanceof Error ? err.message : 'Unsplash search failed'
      )
    } finally {
      setIsSearchingUnsplashFeatured(false)
    }
  }, [
    searchUnsplashImages,
    unsplashFeaturedOrientation,
    unsplashFeaturedPerPage,
    unsplashFeaturedQuery,
  ])

  const runFeaturedPexelsSearch = useCallback(async () => {
    setIsSearchingPexelsFeatured(true)
    setPexelsFeaturedError(null)

    try {
      const photos = await searchExternalPhotos(
        searchPexelsImages,
        pexelsFeaturedQuery,
        pexelsFeaturedPerPage,
        pexelsFeaturedOrientation
      )
      setPexelsFeaturedResults(photos)
    } catch (err) {
      setPexelsFeaturedResults([])
      setPexelsFeaturedError(
        err instanceof Error ? err.message : 'Pexels search failed'
      )
    } finally {
      setIsSearchingPexelsFeatured(false)
    }
  }, [
    pexelsFeaturedOrientation,
    pexelsFeaturedPerPage,
    pexelsFeaturedQuery,
    searchPexelsImages,
  ])

  const runBlockUnsplashSearch = useCallback(async () => {
    setIsSearchingUnsplashBlock(true)
    setUnsplashBlockError(null)

    try {
      const photos = await searchExternalPhotos(
        searchUnsplashImages,
        unsplashBlockQuery,
        unsplashBlockPerPage,
        unsplashBlockOrientation
      )
      setUnsplashBlockResults(photos)
    } catch (err) {
      setUnsplashBlockResults([])
      setUnsplashBlockError(
        err instanceof Error ? err.message : 'Unsplash search failed'
      )
    } finally {
      setIsSearchingUnsplashBlock(false)
    }
  }, [
    searchUnsplashImages,
    unsplashBlockOrientation,
    unsplashBlockPerPage,
    unsplashBlockQuery,
  ])

  const runBlockPexelsSearch = useCallback(async () => {
    setIsSearchingPexelsBlock(true)
    setPexelsBlockError(null)

    try {
      const photos = await searchExternalPhotos(
        searchPexelsImages,
        pexelsBlockQuery,
        pexelsBlockPerPage,
        pexelsBlockOrientation
      )
      setPexelsBlockResults(photos)
    } catch (err) {
      setPexelsBlockResults([])
      setPexelsBlockError(
        err instanceof Error ? err.message : 'Pexels search failed'
      )
    } finally {
      setIsSearchingPexelsBlock(false)
    }
  }, [
    pexelsBlockOrientation,
    pexelsBlockPerPage,
    pexelsBlockQuery,
    searchPexelsImages,
  ])

  return {
    showImageModal,
    setShowImageModal,
    featuredImageSource,
    setFeaturedImageSource,
    imageSearch,
    setImageSearch,
    imageAltText,
    setImageAltText,
    imagePhotographerCredit,
    setImagePhotographerCredit,
    unsplashFeaturedQuery,
    setUnsplashFeaturedQuery,
    unsplashFeaturedResults,
    isSearchingUnsplashFeatured,
    unsplashFeaturedError,
    unsplashFeaturedOrientation,
    setUnsplashFeaturedOrientation,
    unsplashFeaturedPerPage,
    setUnsplashFeaturedPerPage,
    pexelsFeaturedQuery,
    setPexelsFeaturedQuery,
    pexelsFeaturedResults,
    isSearchingPexelsFeatured,
    pexelsFeaturedError,
    pexelsFeaturedOrientation,
    setPexelsFeaturedOrientation,
    pexelsFeaturedPerPage,
    setPexelsFeaturedPerPage,
    isImportingFeaturedExternalImage,
    externalImageCropDraft,
    setExternalImageCropDraft,
    externalImageCropError,
    setExternalImageCropError,
    externalImageUploadProgress,
    setExternalImageUploadProgress,
    isUploadingExternalImageVariants,
    setIsUploadingExternalImageVariants,
    isImportingBlockExternalImage,
    blockImageModal,
    blockImageSource,
    setBlockImageSource,
    blockImageSearch,
    setBlockImageSearch,
    blockImageAltText,
    setBlockImageAltText,
    blockImagePhotographerCredit,
    setBlockImagePhotographerCredit,
    imgBlockAssets,
    isLoadingImgBlockAssets,
    imgBlockAssetsError,
    selectedImgBlockAssetIds,
    toggleImgBlockAssetSelection,
    imgBlockCaption,
    setImgBlockCaption,
    imgTrioFormat,
    setImgTrioFormat,
    unsplashBlockQuery,
    setUnsplashBlockQuery,
    unsplashBlockResults,
    isSearchingUnsplashBlock,
    unsplashBlockError,
    unsplashBlockOrientation,
    setUnsplashBlockOrientation,
    unsplashBlockPerPage,
    setUnsplashBlockPerPage,
    pexelsBlockQuery,
    setPexelsBlockQuery,
    pexelsBlockResults,
    isSearchingPexelsBlock,
    pexelsBlockError,
    pexelsBlockOrientation,
    setPexelsBlockOrientation,
    pexelsBlockPerPage,
    setPexelsBlockPerPage,
    openBlockImageModal,
    closeBlockImageModal,
    findPreferredVariantAsset,
    handleUploadExternalCroppedVariants,
    handleSkipCropExternalImport,
    handleImportFeaturedExternalImage,
    handleImportBlockExternalImage,
    handleUploadComplete,
    handleBlockImageUploadComplete,
    runFeaturedUnsplashSearch,
    runFeaturedPexelsSearch,
    runBlockUnsplashSearch,
    runBlockPexelsSearch,
  }
}

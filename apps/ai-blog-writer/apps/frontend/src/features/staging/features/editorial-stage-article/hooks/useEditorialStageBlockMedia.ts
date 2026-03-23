import { useCallback, useEffect, useState } from 'react'
import type {
  MediaAsset,
  PexelsPhoto,
  UnsplashPhoto,
} from '../../../api'
import type {
  BlockImageModalMode,
  BlockImageModalState,
  ImageSourceOption,
  ImgTrioFormat,
  MediaVariant,
  OpenBlockImageModalOptions,
  PexelsOrientationOption,
} from '../types'
import {
  IMG_BLOCK_MIN_HEIGHT,
  IMG_BLOCK_MIN_WIDTH,
  IMG_PAIR_REQUIRED_IMAGE_COUNT,
  IMG_TRIO_DEFAULT_FORMAT,
  IMG_TRIO_REQUIRED_IMAGE_COUNT,
} from '../constants'
import {
  getImgTrioDimensions,
  getRelationshipId,
  mergeMediaAssetLists,
} from '../media-utils'
import { searchExternalPhotos } from '../services/editorial-stage-image-search.service'

type UseEditorialStageBlockMediaParams = {
  token: string | null | undefined
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
      id?: number
    }
  ) => Promise<{ docs: MediaAsset[]; totalDocs: number }>
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
  clearOpenImagePickerTarget: () => void
  resetExternalImportState: () => void
}

export function useEditorialStageBlockMedia({
  token,
  mediaAssets,
  fetchMediaAssets,
  searchPexelsImages,
  searchUnsplashImages,
  clearOpenImagePickerTarget,
  resetExternalImportState,
}: UseEditorialStageBlockMediaParams) {
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
    resetExternalImportState()
  }, [resetExternalImportState])

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
    resetExternalImportState()
    clearOpenImagePickerTarget()
    setBlockImageModal({
      blockId,
      show: true,
      mode,
      replaceExistingBlock: options?.replaceExistingBlock === true,
    })
  }, [clearOpenImagePickerTarget, resetExternalImportState])

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

  const toggleImgBlockAssetSelection = useCallback((assetId: number, requiredCount: number) => {
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
    const allKnownAssets = [...mediaAssets, ...imgBlockAssets]
    const selectedAsset = allKnownAssets.find((asset) => asset.id === assetId)
    if (!selectedAsset) return null

    const mediaSetId = getRelationshipId(selectedAsset.mediaSet)
    if (mediaSetId === null || !selectedAsset.variant) {
      return selectedAsset
    }

    const preferred = allKnownAssets.find((asset) => {
      const candidateMediaSetId = getRelationshipId(asset.mediaSet)
      return candidateMediaSetId !== null
        && String(candidateMediaSetId) === String(mediaSetId)
        && asset.variant === preferredVariant
    })

    return preferred || selectedAsset
  }, [mediaAssets, imgBlockAssets])

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
    blockImageModal,
    openBlockImageModal,
    closeBlockImageModal,
    blockImageSource,
    setBlockImageSource,
    blockImageSearch,
    setBlockImageSearch,
    blockImageAltText,
    setBlockImageAltText,
    blockImagePhotographerCredit,
    setBlockImagePhotographerCredit,
    imgBlockAssets,
    setImgBlockAssets,
    isLoadingImgBlockAssets,
    imgBlockAssetsError,
    selectedImgBlockAssetIds,
    setSelectedImgBlockAssetIds,
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
    setUnsplashBlockError,
    unsplashBlockOrientation,
    setUnsplashBlockOrientation,
    unsplashBlockPerPage,
    setUnsplashBlockPerPage,
    pexelsBlockQuery,
    setPexelsBlockQuery,
    pexelsBlockResults,
    isSearchingPexelsBlock,
    pexelsBlockError,
    setPexelsBlockError,
    pexelsBlockOrientation,
    setPexelsBlockOrientation,
    pexelsBlockPerPage,
    setPexelsBlockPerPage,
    isImportingBlockExternalImage,
    setIsImportingBlockExternalImage,
    runBlockUnsplashSearch,
    runBlockPexelsSearch,
    findPreferredVariantAsset,
    mergeMediaAssetsIntoState,
  }
}

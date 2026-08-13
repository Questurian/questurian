import { useCallback, useEffect, useRef, useState } from 'react'
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

const BLOCK_PAYLOAD_PAGE_LIMIT = 60

type UseEditorialStageBlockMediaParams = {
  mediaAssets: MediaAsset[]
  fetchMediaAssets: (
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
  const [imgBlockAssets, setImgBlockAssets] = useState<MediaAsset[]>([])
  const [isLoadingImgBlockAssets, setIsLoadingImgBlockAssets] = useState(false)
  const [imgBlockAssetsError, setImgBlockAssetsError] = useState<string | null>(null)
  const [imgBlockPayloadPage, setImgBlockPayloadPage] = useState(0)
  const [imgBlockPayloadTotalPages, setImgBlockPayloadTotalPages] = useState(1)
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
  const imgBlockAssetsRef = useRef<MediaAsset[]>([])
  const mediaAssetsRef = useRef<MediaAsset[]>(mediaAssets)
  const selectedImgBlockAssetIdsRef = useRef<number[]>([])

  useEffect(() => {
    imgBlockAssetsRef.current = imgBlockAssets
  }, [imgBlockAssets])

  useEffect(() => {
    mediaAssetsRef.current = mediaAssets
  }, [mediaAssets])

  useEffect(() => {
    selectedImgBlockAssetIdsRef.current = selectedImgBlockAssetIds
  }, [selectedImgBlockAssetIds])

  const mergeMediaAssetsIntoState = useCallback((assets: MediaAsset[]) => {
    setImgBlockAssets((existingAssets) => {
      const mergedAssets = mergeMediaAssetLists(existingAssets, assets)
      imgBlockAssetsRef.current = mergedAssets
      return mergedAssets
    })
  }, [])

  const replaceImgBlockAssets = useCallback((
    assets: MediaAsset[],
    pagination?: {
      page: number
      totalPages: number
    }
  ) => {
    imgBlockAssetsRef.current = assets
    setImgBlockAssets(assets)
    if (pagination) {
      setImgBlockPayloadPage(pagination.page)
      setImgBlockPayloadTotalPages(pagination.totalPages)
    }
  }, [])

  const buildPayloadRequestParams = useCallback(() => {
    if (!blockImageModal) return null

    const request: {
      limit: number
      mimeType: string
      width?: number
      height?: number
    } = {
      limit: BLOCK_PAYLOAD_PAGE_LIMIT,
      mimeType: 'image/',
    }

    if (blockImageModal.mode === 'img') {
      request.width = IMG_BLOCK_MIN_WIDTH
      request.height = IMG_BLOCK_MIN_HEIGHT
      return request
    }

    if (blockImageModal.mode === 'img-trio') {
      const dims = getImgTrioDimensions(imgTrioFormat)
      request.width = dims.width
      request.height = dims.height
    }

    return request
  }, [blockImageModal, imgTrioFormat])

  const fetchImgBlockPayloadPage = useCallback(async (
    page: number,
    options?: {
      reset?: boolean
    }
  ) => {
    const request = buildPayloadRequestParams()
    if (!blockImageModal || !request) return

    setIsLoadingImgBlockAssets(true)
    setImgBlockAssetsError(null)

    try {
      const response = await fetchMediaAssets({
        ...request,
        page,
      })
      const docs = response.docs || []
      const selectedSeedAssets = options?.reset
        ? mediaAssetsRef.current.filter((asset) =>
            selectedImgBlockAssetIdsRef.current.includes(asset.id)
          )
        : []
      const mergedAssets = mergeMediaAssetLists(
        options?.reset ? selectedSeedAssets : imgBlockAssetsRef.current,
        docs
      )

      replaceImgBlockAssets(mergedAssets, {
        page,
        totalPages: response.totalPages || 1,
      })

      if (blockImageModal.mode !== 'default') {
        const requiredCount = blockImageModal.mode === 'img-trio'
          ? IMG_TRIO_REQUIRED_IMAGE_COUNT
          : IMG_PAIR_REQUIRED_IMAGE_COUNT
        const allowedAssetIds = new Set(mergedAssets.map((asset) => asset.id))
        setSelectedImgBlockAssetIds((current) =>
          current.filter((id) => allowedAssetIds.has(id)).slice(0, requiredCount)
        )
      }
    } catch (err) {
      if (options?.reset) {
        const selectedSeedAssets = mediaAssetsRef.current.filter((asset) =>
          selectedImgBlockAssetIdsRef.current.includes(asset.id)
        )
        replaceImgBlockAssets(selectedSeedAssets, {
          page: 0,
          totalPages: 1,
        })
      }

      setImgBlockAssetsError(
        err instanceof Error
          ? err.message
          : 'Failed to load Payload images.'
      )
    } finally {
      setIsLoadingImgBlockAssets(false)
    }
  }, [
    blockImageModal,
    buildPayloadRequestParams,
    fetchMediaAssets,
    replaceImgBlockAssets,
  ])

  const reloadImgBlockAssets = useCallback(async () => {
    if (!blockImageModal) return

    const selectedSeedAssets = mediaAssetsRef.current.filter((asset) =>
      selectedImgBlockAssetIdsRef.current.includes(asset.id)
    )
    replaceImgBlockAssets(selectedSeedAssets, {
      page: 0,
      totalPages: 1,
    })
    await fetchImgBlockPayloadPage(1, { reset: true })
  }, [blockImageModal, fetchImgBlockPayloadPage, replaceImgBlockAssets])

  const loadMoreImgBlockAssets = useCallback(async () => {
    if (!blockImageModal) return
    if (isLoadingImgBlockAssets) return
    if (imgBlockPayloadPage >= imgBlockPayloadTotalPages && imgBlockPayloadPage > 0) return

    const nextPage = imgBlockPayloadPage + 1
    await fetchImgBlockPayloadPage(nextPage)
  }, [
    blockImageModal,
    fetchImgBlockPayloadPage,
    imgBlockPayloadPage,
    imgBlockPayloadTotalPages,
    isLoadingImgBlockAssets,
  ])

  const closeBlockImageModal = useCallback(() => {
    setBlockImageSource('payload')
    setBlockImageModal(null)
    setSelectedImgBlockAssetIds([])
    setImgBlockCaption('')
    setImgTrioFormat(IMG_TRIO_DEFAULT_FORMAT)
    replaceImgBlockAssets([], {
      page: 0,
      totalPages: 1,
    })
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
  }, [replaceImgBlockAssets, resetExternalImportState])

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
    replaceImgBlockAssets([], {
      page: 0,
      totalPages: 1,
    })
    resetExternalImportState()
    clearOpenImagePickerTarget()
    setBlockImageModal({
      blockId,
      show: true,
      mode,
      replaceExistingBlock: options?.replaceExistingBlock === true,
    })
  }, [clearOpenImagePickerTarget, replaceImgBlockAssets, resetExternalImportState])

  const blockPayloadRequestKey = blockImageModal
    ? `${blockImageModal.blockId}:${blockImageModal.mode}:${blockImageModal.mode === 'img-trio' ? imgTrioFormat : 'default'}`
    : ''

  useEffect(() => {
    if (!blockImageModal) return
    if (blockImageSource !== 'payload') return


    void reloadImgBlockAssets()
  }, [blockImageSource, blockPayloadRequestKey, reloadImgBlockAssets, replaceImgBlockAssets, blockImageModal])

  useEffect(() => {
    if (blockImageSource === 'payload') return
    setImgBlockAssetsError(null)
  }, [blockImageSource])

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
    imgBlockAssets,
    isLoadingImgBlockAssets,
    imgBlockAssetsError,
    hasMoreImgBlockAssets: imgBlockPayloadPage < imgBlockPayloadTotalPages,
    loadMoreImgBlockAssets,
    reloadImgBlockAssets,
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

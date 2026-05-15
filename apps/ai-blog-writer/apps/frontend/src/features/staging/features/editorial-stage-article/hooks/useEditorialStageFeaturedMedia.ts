import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  PexelsPhoto,
  UnsplashPhoto,
} from '../../../api'
import type {
  ImageSourceOption,
  PexelsOrientationOption,
} from '../types'
import {
  buildFeaturedUploadExternalRef,
  buildImageFileNamePrefix,
} from '../media-utils'
import { searchExternalPhotos } from '../services/editorial-stage-image-search.service'

type UseEditorialStageFeaturedMediaParams = {
  stagedArticleId: string
  articleTitle: string
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
  resetExternalImportState: () => void
}

export function useEditorialStageFeaturedMedia({
  stagedArticleId,
  articleTitle,
  searchPexelsImages,
  searchUnsplashImages,
  resetExternalImportState,
}: UseEditorialStageFeaturedMediaParams) {
  const buildUploadIdentity = useCallback(() => {
    const externalRef = buildFeaturedUploadExternalRef(stagedArticleId)
    return {
      featuredImageUploadExternalRef: externalRef,
      featuredImageFileNamePrefix: buildImageFileNamePrefix(articleTitle, externalRef),
    }
  }, [articleTitle, stagedArticleId])

  const [featuredUploadIdentity, setFeaturedUploadIdentity] = useState(buildUploadIdentity)
  const [showImageModal, setShowImageModal] = useState(false)
  const [featuredImageSource, setFeaturedImageSource] = useState<ImageSourceOption>('payload')
  const [imageSearch, setImageSearch] = useState('')
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
  const wasImageModalOpenRef = useRef(false)

  useEffect(() => {
    if (showImageModal && !wasImageModalOpenRef.current) {
      setFeaturedUploadIdentity(buildUploadIdentity())
    }

    wasImageModalOpenRef.current = showImageModal
  }, [buildUploadIdentity, showImageModal])

  useEffect(() => {
    if (showImageModal) return

    setFeaturedImageSource('payload')
    setIsImportingFeaturedExternalImage(false)
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
    resetExternalImportState()
  }, [resetExternalImportState, showImageModal])

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

  return {
    ...featuredUploadIdentity,
    showImageModal,
    setShowImageModal,
    featuredImageSource,
    setFeaturedImageSource,
    imageSearch,
    setImageSearch,
    unsplashFeaturedQuery,
    setUnsplashFeaturedQuery,
    unsplashFeaturedResults,
    isSearchingUnsplashFeatured,
    unsplashFeaturedError,
    setUnsplashFeaturedError,
    unsplashFeaturedOrientation,
    setUnsplashFeaturedOrientation,
    unsplashFeaturedPerPage,
    setUnsplashFeaturedPerPage,
    pexelsFeaturedQuery,
    setPexelsFeaturedQuery,
    pexelsFeaturedResults,
    isSearchingPexelsFeatured,
    pexelsFeaturedError,
    setPexelsFeaturedError,
    pexelsFeaturedOrientation,
    setPexelsFeaturedOrientation,
    pexelsFeaturedPerPage,
    setPexelsFeaturedPerPage,
    isImportingFeaturedExternalImage,
    setIsImportingFeaturedExternalImage,
    runFeaturedUnsplashSearch,
    runFeaturedPexelsSearch,
  }
}

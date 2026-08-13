import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react'
import type {
  ExternalImageProvider,
  Location,
  MediaAsset,
  PexelsPhoto,
  UnsplashPhoto,
} from '../../../api'
import type { StagedArticle } from '../../../types'
import { getBlockMediaPayload } from '../workflow.service'
import { useEditorialStageFeaturedMedia } from './useEditorialStageFeaturedMedia'
import { useEditorialStageBlockMedia } from './useEditorialStageBlockMedia'

type PublishResult = { success: boolean; message: string } | null

function getReferencedBlockAssetIds(blocks: StagedArticle['blocks'] | undefined): number[] {
  if (!blocks?.length) return []

  const assetIds = new Set<number>()

  blocks.forEach((block) => {
    const mediaPayload = getBlockMediaPayload(block)
    if (!mediaPayload) return

    if (mediaPayload.type === 'single') {
      assetIds.add(mediaPayload.imageAfter)
      return
    }

    if (mediaPayload.type === 'pair') {
      assetIds.add(mediaPayload.imgPairAfter.imageOne)
      assetIds.add(mediaPayload.imgPairAfter.imageTwo)
      return
    }

    assetIds.add(mediaPayload.imgTrioAfter.imageOne)
    assetIds.add(mediaPayload.imgTrioAfter.imageTwo)
    assetIds.add(mediaPayload.imgTrioAfter.imageThree)
  })

  return Array.from(assetIds).filter((assetId) => Number.isFinite(assetId) && assetId > 0)
}

type UseEditorialStageMediaParams = {
  stagedArticle: StagedArticle | null
  locations: Location[]
  mediaAssets: MediaAsset[]
  mergeMediaAssetsIntoState: (assets: MediaAsset[]) => void
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
  fetchExternalImageSource: (
    input: {
      sourceUrl: string
      provider: ExternalImageProvider
      photoId?: string | number
    },
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

/**
 * Editorial-stage media state. Since the Image Picker now owns all browse/upload/
 * import flows (ADR 0020), this hook keeps only what the timeline needs: the
 * block/featured modal open-state (via the sub-hooks) and the referenced-asset
 * hydration that backfills assets a block references but the media page hasn't
 * loaded yet. The params keep the full shape the sub-hooks consume.
 */
export function useEditorialStageMedia({
  stagedArticle,
  mediaAssets,
  mergeMediaAssetsIntoState,
  fetchMediaAssets,
  searchPexelsImages,
  searchUnsplashImages,
  clearOpenImagePickerTarget,
}: UseEditorialStageMediaParams) {
  const resetExternalImportState = useCallback(() => {}, [])

  const block = useEditorialStageBlockMedia({
    mediaAssets,
    fetchMediaAssets,
    searchPexelsImages,
    searchUnsplashImages,
    clearOpenImagePickerTarget,
    resetExternalImportState,
  })
  const mergeBlockMediaAssetsIntoState = block.mergeMediaAssetsIntoState

  // Backfill assets referenced by blocks but missing from the loaded media page.
  useEffect(() => {
    if (!stagedArticle?.blocks.length) return

    const loadedAssetIds = new Set(mediaAssets.map((asset) => asset.id))
    const missingBlockAssetIds = getReferencedBlockAssetIds(stagedArticle.blocks).filter(
      (assetId) => !loadedAssetIds.has(assetId)
    )

    if (!missingBlockAssetIds.length) return

    let isCancelled = false

    const hydrateMissingBlockAssets = async () => {
      const responses = await Promise.all(
        missingBlockAssetIds.map(async (assetId) => {
          try {
            return await fetchMediaAssets({
              limit: 1,
              id: assetId,
            })
          } catch {
            return null
          }
        })
      )

      if (isCancelled) return

      const hydratedAssets = responses.flatMap((response) => response?.docs || [])
      if (!hydratedAssets.length) return

      mergeMediaAssetsIntoState(hydratedAssets)
      mergeBlockMediaAssetsIntoState(hydratedAssets)
    }

    void hydrateMissingBlockAssets()

    return () => {
      isCancelled = true
    }
  }, [
    stagedArticle?.blocks,
    mediaAssets,
    fetchMediaAssets,
    mergeMediaAssetsIntoState,
    mergeBlockMediaAssetsIntoState,
  ])

  // Backfill the featured asset if it isn't already loaded.
  useEffect(() => {
    if (!stagedArticle?.featuredImageId) return

    const featuredAssetId = Number(stagedArticle.featuredImageId)
    if (!Number.isFinite(featuredAssetId) || featuredAssetId <= 0) return
    if (mediaAssets.some((asset) => asset.id === featuredAssetId)) return

    let isCancelled = false

    const hydrateFeaturedAsset = async () => {
      try {
        const response = await fetchMediaAssets({
          limit: 1,
          id: featuredAssetId,
        })
        if (isCancelled) return
        mergeMediaAssetsIntoState(response.docs || [])
        mergeBlockMediaAssetsIntoState(response.docs || [])
      } catch {
        // Keep UI fallback in place if this targeted hydration fails.
      }
    }

    void hydrateFeaturedAsset()

    return () => {
      isCancelled = true
    }
  }, [
    stagedArticle?.featuredImageId,
    mediaAssets,
    fetchMediaAssets,
    mergeMediaAssetsIntoState,
    mergeBlockMediaAssetsIntoState,
  ])

  const featured = useEditorialStageFeaturedMedia({
    stagedArticleId: stagedArticle?.id ?? 'staged-article',
    articleTitle: stagedArticle?.title ?? 'Featured Image',
    searchPexelsImages,
    searchUnsplashImages,
    resetExternalImportState,
  })

  return {
    featured,
    block,
    shared: {
      findPreferredVariantAsset: block.findPreferredVariantAsset,
      mergeMediaAssetsIntoState: block.mergeMediaAssetsIntoState,
    },
  }
}

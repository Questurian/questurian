import { renderHook, waitFor } from '@testing-library/react'
import { useCallback, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { MediaAsset } from '../../../api'
import type { StagedArticle } from '../../../types'
import { createEmptySeoSection } from '../../../../shared/seo/services/seo-section.service'
import { DEFAULT_TRIP_INTENT } from '../../../../trip-intent'
import { useEditorialStageMedia } from './useEditorialStageMedia'

function buildMediaAsset(id: number): MediaAsset {
  return {
    id,
    filename: `asset-${id}.jpg`,
    width: 1200,
    height: 675,
    variant: 'wide',
  }
}

function buildStagedArticle(): StagedArticle {
  return {
    id: 'staged-1',
    runId: 'run-1',
    originalTitle: 'Original title',
    originalContent: 'Original content',
    originalType: 'guide',
    title: 'Best Cafes in Lima',
    content: 'Article content',
    blocks: [
      {
        id: 'image-block',
        type: 'image',
        content: '',
        imageAfter: 101,
      },
      {
        id: 'pair-block',
        type: 'img-pair',
        content: '',
        imgPairAfter: {
          imageOne: 201,
          imageTwo: 202,
        },
      },
      {
        id: 'trio-block',
        type: 'img-trio',
        content: '',
        imgTrioAfter: {
          format: 'square',
          imageOne: 301,
          imageTwo: 302,
          imageThree: 303,
        },
      },
    ],
    editorialBlocks: [],
    sharedNeighborhoods: [],
    tripIntent: [...DEFAULT_TRIP_INTENT],
    seoSection: createEmptySeoSection(),
    syncBehavior: 'finalize',
    lexicalConverted: false,
    publishedToPayload: false,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  }
}

describe('useEditorialStageMedia', () => {
  it('hydrates referenced block image assets that are missing from the initial media page', async () => {
    const fetchMediaAssets = vi.fn(async (_token?: string, params?: { id?: number }) => {
      const assetId = params?.id

      return {
        docs: typeof assetId === 'number' ? [buildMediaAsset(assetId)] : [],
        totalDocs: typeof assetId === 'number' ? 1 : 0,
        totalPages: 1,
      }
    })

    const mergeMediaAssetsIntoState = vi.fn()

    const useHarness = () => {
      const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([])

      const mergeIntoState = useCallback((assets: MediaAsset[]) => {
        mergeMediaAssetsIntoState(assets)
        setMediaAssets((existingAssets) => {
          const mergedAssets = new Map<number, MediaAsset>()
          existingAssets.forEach((asset) => mergedAssets.set(asset.id, asset))
          assets.forEach((asset) => mergedAssets.set(asset.id, asset))
          return Array.from(mergedAssets.values())
        })
      }, [])

      return useEditorialStageMedia({
        token: 'token',
        stagedArticle: buildStagedArticle(),
        locations: [],
        mediaAssets,
        mergeMediaAssetsIntoState: mergeIntoState,
        fetchMediaAssets,
        fetchExternalImageSource: vi.fn(),
        searchPexelsImages: vi.fn().mockResolvedValue({ photos: [] }),
        searchUnsplashImages: vi.fn().mockResolvedValue({ photos: [] }),
        updateStagedArticle: vi.fn(),
        setPublishResult: vi.fn(),
        setActiveEditingTimelineItemId: vi.fn(),
        getImageTimelineItemId: (blockId: string) => `image:${blockId}`,
        addImageAfterBlock: vi.fn(),
        clearOpenImagePickerTarget: vi.fn(),
      })
    }

    renderHook(() => useHarness())

    await waitFor(() => {
      const requestedIds = Array.from(new Set(
        fetchMediaAssets.mock.calls
          .map(([, params]) => params?.id)
          .filter((assetId): assetId is number => typeof assetId === 'number')
      )).sort((left, right) => left - right)

      expect(requestedIds).toEqual([101, 201, 202, 301, 302, 303])
    })

    await waitFor(() => {
      expect(mergeMediaAssetsIntoState).toHaveBeenCalledWith([
        buildMediaAsset(101),
        buildMediaAsset(201),
        buildMediaAsset(202),
        buildMediaAsset(301),
        buildMediaAsset(302),
        buildMediaAsset(303),
      ])
    })
  })
})

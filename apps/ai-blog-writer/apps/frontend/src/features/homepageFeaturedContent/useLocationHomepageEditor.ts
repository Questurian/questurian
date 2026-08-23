import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  addLocationHomepageBlock,
  deleteLocationHomepageBlock,
  fetchLocationHomepage,
  publishLocationHomepage,
  reorderLocationHomepageBlocks,
  convertLocationHomepageFeaturedArticlesBlock,
  toggleLocationHomepage,
  type LocationHomepageResponse
} from './locationHomepages'
import {
  buildOptimisticConvertedHomepageBlock,
  deleteHomepageBlockFromCache,
  reorderHomepageBlocksInCache,
  replaceHomepageBlockInCache
} from './homepageBlockOptimisticUpdates'
import type { CuratedHomepageBlockType, PageBlockResponse } from './pageBlocks'

/**
 * Data + mutations for one location homepage.
 *
 * Delete, reorder and convert all write optimistically into the homepage query
 * cache and roll back on error, so the block list never flickers through a
 * refetch. `pageBlockSlotKeys` tracks which article slots each block has taken
 * so editors can exclude each other's picks.
 */
export function useLocationHomepageEditor(
  numericId: number,
  canManage: boolean,
  operatorId?: string
) {
  const queryClient = useQueryClient()
  // Keyed by operator for the same reason as the main homepage: the
  // QueryClient outlives a logout.
  const homepageQueryKey = [
    'location-homepage',
    numericId,
    operatorId ?? 'anonymous'
  ]

  const homepageQuery = useQuery({
    queryKey: homepageQueryKey,
    queryFn: ({ signal }) => fetchLocationHomepage(numericId, signal),
    enabled: Boolean(canManage && numericId)
  })

  const [isEnabled, setIsEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    if (homepageQuery.data && isEnabled === null) {
      setIsEnabled(homepageQuery.data.isEnabled)
    }
  }, [homepageQuery.data, isEnabled])

  const toggleMutation = useMutation({
    mutationFn: () => toggleLocationHomepage(numericId),
    onSuccess: (result) => {
      setIsEnabled(result.isEnabled)
      queryClient.invalidateQueries({ queryKey: ['location-homepages-list'] })
    }
  })

  const publishMutation = useMutation({
    mutationFn: () => publishLocationHomepage(numericId),
    onSuccess: (result) => {
      queryClient.setQueryData<LocationHomepageResponse>(
        homepageQueryKey,
        result
      )
      queryClient.invalidateQueries({ queryKey: homepageQueryKey })
    }
  })

  const [showAddBlock, setShowAddBlock] = useState(false)
  const [viewMode, setViewMode] = useState<'draft' | 'published'>('draft')
  const [deletingBlockId, setDeletingBlockId] = useState<string | null>(null)
  const [pageBlockSlotKeys, setPageBlockSlotKeys] = useState<
    Map<string, Set<string>>
  >(() => new Map())

  const handleSlotsChange = useCallback(
    (blockId: string, keys: Set<string>) => {
      setPageBlockSlotKeys((prev) => {
        // Bail out without a state change when the keys are unchanged; block
        // editors report on every keys-identity change, and an unconditional new
        // Map here would re-render them and loop.
        const existing = prev.get(blockId)
        if (keys.size === 0 && !existing) return prev
        if (
          existing &&
          existing.size === keys.size &&
          [...keys].every((key) => existing.has(key))
        ) {
          return prev
        }
        const next = new Map(prev)
        if (keys.size === 0) {
          next.delete(blockId)
        } else {
          next.set(blockId, keys)
        }
        return next
      })
    },
    []
  )

  const addBlockMutation = useMutation({
    mutationFn: ({
      blockType,
      slotCount,
      sectionHeading,
      sectionSubheading
    }: {
      blockType: CuratedHomepageBlockType
      slotCount: number
      sectionHeading?: string | null
      sectionSubheading?: string | null
    }) =>
      addLocationHomepageBlock(
        numericId,
        blockType,
        slotCount,
        sectionHeading,
        sectionSubheading
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: homepageQueryKey })
      setShowAddBlock(false)
    }
  })

  const deleteBlockMutation = useMutation({
    mutationFn: ({ blockId }: { blockId: string }) =>
      deleteLocationHomepageBlock(numericId, blockId),
    onMutate: async ({ blockId }) => {
      setDeletingBlockId(blockId)
      await queryClient.cancelQueries({ queryKey: homepageQueryKey })
      const previousHomepage =
        queryClient.getQueryData<LocationHomepageResponse>(homepageQueryKey)
      queryClient.setQueryData<LocationHomepageResponse>(
        homepageQueryKey,
        (current) => deleteHomepageBlockFromCache(current, blockId)
      )
      return { previousHomepage }
    },
    onError: (_error, _variables, context) => {
      if (context?.previousHomepage) {
        queryClient.setQueryData(homepageQueryKey, context.previousHomepage)
      }
    },
    onSettled: () => {
      setDeletingBlockId(null)
    }
  })

  const reorderBlocksMutation = useMutation({
    mutationFn: (orderedBlockIds: string[]) =>
      reorderLocationHomepageBlocks(numericId, orderedBlockIds),
    onMutate: async (orderedBlockIds) => {
      await queryClient.cancelQueries({ queryKey: homepageQueryKey })
      const previousHomepage =
        queryClient.getQueryData<LocationHomepageResponse>(homepageQueryKey)
      queryClient.setQueryData<LocationHomepageResponse>(
        homepageQueryKey,
        (current) => reorderHomepageBlocksInCache(current, orderedBlockIds)
      )
      return { previousHomepage }
    },
    onSuccess: (result) => {
      queryClient.setQueryData<LocationHomepageResponse>(
        homepageQueryKey,
        (current) =>
          reorderHomepageBlocksInCache(current, result.orderedBlockIds)
      )
    },
    onError: (_error, _variables, context) => {
      if (context?.previousHomepage) {
        queryClient.setQueryData(homepageQueryKey, context.previousHomepage)
      }
    }
  })

  async function handleConvertBlock(
    block: PageBlockResponse,
    blockType: CuratedHomepageBlockType,
    slotCount: number
  ) {
    await queryClient.cancelQueries({ queryKey: homepageQueryKey })
    const previousHomepage =
      queryClient.getQueryData<LocationHomepageResponse>(homepageQueryKey)
    const optimisticBlock = buildOptimisticConvertedHomepageBlock(
      block,
      blockType,
      slotCount
    )

    queryClient.setQueryData<LocationHomepageResponse>(
      homepageQueryKey,
      (current) => replaceHomepageBlockInCache(current, optimisticBlock)
    )

    try {
      const result = await convertLocationHomepageFeaturedArticlesBlock(
        numericId,
        block.id,
        blockType,
        slotCount
      )
      queryClient.setQueryData<LocationHomepageResponse>(
        homepageQueryKey,
        (current) => replaceHomepageBlockInCache(current, result.block)
      )
    } catch (error) {
      if (previousHomepage) {
        queryClient.setQueryData(homepageQueryKey, previousHomepage)
      }
      throw error
    }
  }

  function handleConfirmAddBlock(
    blockType: CuratedHomepageBlockType,
    slotCount: number,
    sectionHeading?: string | null,
    sectionSubheading?: string | null
  ) {
    addBlockMutation.mutate({
      blockType,
      slotCount,
      sectionHeading,
      sectionSubheading
    })
  }

  const deleteError = deleteBlockMutation.isError
    ? deleteBlockMutation.error instanceof Error
      ? deleteBlockMutation.error.message
      : 'Failed to delete block.'
    : null

  const invalidateHomepage = () => {
    queryClient.invalidateQueries({ queryKey: homepageQueryKey })
  }

  return {
    homepageQueryKey,
    homepageQuery,
    isEnabled,
    toggleMutation,
    publishMutation,
    showAddBlock,
    setShowAddBlock,
    viewMode,
    setViewMode,
    deletingBlockId,
    pageBlockSlotKeys,
    handleSlotsChange,
    addBlockMutation,
    deleteBlockMutation,
    reorderBlocksMutation,
    handleConvertBlock,
    handleConfirmAddBlock,
    deleteError,
    invalidateHomepage
  }
}

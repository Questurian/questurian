import { useCallback, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  addMainHomepageBlock,
  convertMainHomepageFeaturedArticlesBlock,
  deleteMainHomepageBlock,
  fetchMainHomepage,
  publishMainHomepage,
  reorderMainHomepageBlocks,
  type MainHomepageResponse,
} from './api'
import {
  buildOptimisticConvertedHomepageBlock,
  deleteHomepageBlockFromCache,
  reorderHomepageBlocksInCache,
  replaceHomepageBlockInCache,
} from './homepageBlockOptimisticUpdates'
import type { CuratedHomepageBlockType, PageBlockResponse } from './pageBlocks'

export function useMainHomepageEditor(
  canManage: boolean,
  operatorId?: string,
) {
  const queryClient = useQueryClient()
  // Keyed by operator: the QueryClient outlives a logout, so an unkeyed cache
  // would hand the next operator the previous one's data until a refetch lands.
  const homepageQueryKey = ['main-homepage', operatorId ?? 'anonymous']

  const homepageQuery = useQuery({
    queryKey: homepageQueryKey,
    queryFn: ({ signal }) => fetchMainHomepage(signal),
    enabled: Boolean(canManage),
  })

  const [showAddBlock, setShowAddBlock] = useState(false)
  const [viewMode, setViewMode] = useState<'draft' | 'published'>('draft')
  const [deletingBlockId, setDeletingBlockId] = useState<string | null>(null)
  const [pageBlockSlotKeys, setPageBlockSlotKeys] = useState<Map<string, Set<string>>>(
    () => new Map(),
  )

  const handleSlotsChange = useCallback((blockId: string, keys: Set<string>) => {
    setPageBlockSlotKeys((previous) => {
      const existing = previous.get(blockId)
      if (keys.size === 0 && !existing) return previous
      if (
        existing
        && existing.size === keys.size
        && [...keys].every((key) => existing.has(key))
      ) {
        return previous
      }

      const next = new Map(previous)
      if (keys.size === 0) next.delete(blockId)
      else next.set(blockId, keys)
      return next
    })
  }, [])

  const addBlockMutation = useMutation({
    mutationFn: ({
      blockType,
      slotCount,
      sectionHeading,
      sectionSubheading,
    }: {
      blockType: CuratedHomepageBlockType
      slotCount: number
      sectionHeading?: string | null
      sectionSubheading?: string | null
    }) => addMainHomepageBlock(
      blockType,
      slotCount,
      sectionHeading,
      sectionSubheading,
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: homepageQueryKey })
      setShowAddBlock(false)
    },
  })

  const deleteBlockMutation = useMutation({
    mutationFn: ({ blockId }: { blockId: string }) =>
      deleteMainHomepageBlock(blockId),
    onMutate: async ({ blockId }) => {
      setDeletingBlockId(blockId)
      await queryClient.cancelQueries({ queryKey: homepageQueryKey })
      const previousHomepage =
        queryClient.getQueryData<MainHomepageResponse>(homepageQueryKey)
      queryClient.setQueryData<MainHomepageResponse>(homepageQueryKey, (current) =>
        deleteHomepageBlockFromCache(current, blockId),
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
    },
  })

  const reorderBlocksMutation = useMutation({
    mutationFn: (orderedBlockIds: string[]) =>
      reorderMainHomepageBlocks(orderedBlockIds),
    onMutate: async (orderedBlockIds) => {
      await queryClient.cancelQueries({ queryKey: homepageQueryKey })
      const previousHomepage =
        queryClient.getQueryData<MainHomepageResponse>(homepageQueryKey)
      queryClient.setQueryData<MainHomepageResponse>(homepageQueryKey, (current) =>
        reorderHomepageBlocksInCache(current, orderedBlockIds),
      )
      return { previousHomepage }
    },
    onSuccess: (result) => {
      queryClient.setQueryData<MainHomepageResponse>(homepageQueryKey, (current) =>
        reorderHomepageBlocksInCache(current, result.orderedBlockIds),
      )
    },
    onError: (_error, _variables, context) => {
      if (context?.previousHomepage) {
        queryClient.setQueryData(homepageQueryKey, context.previousHomepage)
      }
    },
  })

  const publishMutation = useMutation({
    mutationFn: () => publishMainHomepage(),
    onSuccess: (result) => {
      queryClient.setQueryData<MainHomepageResponse>(homepageQueryKey, result)
      queryClient.invalidateQueries({ queryKey: homepageQueryKey })
    },
  })

  async function handleConvertBlock(
    block: PageBlockResponse,
    blockType: CuratedHomepageBlockType,
    slotCount: number,
  ) {
    await queryClient.cancelQueries({ queryKey: homepageQueryKey })
    const previousHomepage =
      queryClient.getQueryData<MainHomepageResponse>(homepageQueryKey)
    const optimisticBlock = buildOptimisticConvertedHomepageBlock(
      block,
      blockType,
      slotCount,
    )

    queryClient.setQueryData<MainHomepageResponse>(homepageQueryKey, (current) =>
      replaceHomepageBlockInCache(current, optimisticBlock),
    )

    try {
      const result = await convertMainHomepageFeaturedArticlesBlock(
        block.id,
        blockType,
        slotCount,
      )
      queryClient.setQueryData<MainHomepageResponse>(homepageQueryKey, (current) =>
        replaceHomepageBlockInCache(current, result.block),
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
    sectionSubheading?: string | null,
  ) {
    addBlockMutation.mutate({
      blockType,
      slotCount,
      sectionHeading,
      sectionSubheading,
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
    homepageQuery,
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
    invalidateHomepage,
  }
}

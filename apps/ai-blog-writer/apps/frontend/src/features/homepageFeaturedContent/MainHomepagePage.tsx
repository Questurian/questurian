import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '../../providers/useAuth'
import './homepageFeaturedContent.css'
import {
  addMainHomepageBlock,
  deleteMainHomepageBlock,
  fetchHomepageFeaturedCandidates,
  fetchHomepageHotelGridCandidates,
  fetchHomepageLocationGridCandidates,
  fetchTourGridCandidates,
  fetchThingsToDoAttractionCandidates,
  fetchThingsToDoListicleCandidates,
  fetchWhereToEatDrinkCandidates,
  convertMainHomepageFeaturedArticlesBlock,
  fetchMainHomepage,
  reorderMainHomepageBlocks,
  updateMainHomepageBlock,
  updateMainHomepageFeaturedSectionHeading,
  updateMainHomepageFeaturedSectionSubheading,
  updateMainHomepageLocationGridMediaAspect,
  updateMainHomepageFeaturedSlot3Layout,
  updateMainHomepageFeaturedSlot4Layout,
  updateMainHomepageFeaturedSlot5Layout,
  updateMainHomepageArticleGridFourLayout,
  type MainHomepageResponse,
} from './api'
import HomepageBlocksSortableList from './HomepageBlocksSortableList'
import AddHomepageBlockPicker from './AddHomepageBlockPicker'
import HomepageBlockDeleteTrigger from './HomepageBlockDeleteTrigger'
import CuratedHomepageBlockEditor from './CuratedHomepageBlockEditor'
import HotelGridBlockEditor from './HotelGridBlockEditor'
import LocationGridBlockEditor from './LocationGridBlockEditor'
import NewsletterSignupBlockEditor from './NewsletterSignupBlockEditor'
import {
  buildOptimisticConvertedHomepageBlock,
  deleteHomepageBlockFromCache,
  reorderHomepageBlocksInCache,
  replaceHomepageBlockInCache,
} from './homepageBlockOptimisticUpdates'
import {
  isHotelGridBlock,
  isTourGridBlock,
  isThingsToDoAttractionsBlock,
  isArticleCuratedHomepageBlock,
  CONVERT_EMPTY_FEATURED_ARTICLES_TO_BLOCK_TYPES,
  homepageBlockEditorIdentity,
  isLocationGridBlock,
  isNewsletterSignupBlock,
  type ArticleCuratedHomepageBlockResponse,
  type CuratedHomepageBlockType,
  type HotelOrAttractionGridBlockResponse,
  type LocationGridBlockResponse,
  type PageBlockResponse,
} from './pageBlocks'
export default function MainHomepagePage() {
  const { token, user } = useAuth()
  const canManage = user?.role === 'admin' || user?.role === 'editor'
  const queryClient = useQueryClient()
  const mainHomepageQueryKey = ['main-homepage', token]

  const homepageQuery = useQuery({
    queryKey: mainHomepageQueryKey,
    queryFn: ({ signal }) => fetchMainHomepage(token!, signal),
    enabled: Boolean(token && canManage),
  })

  const [showAddBlock, setShowAddBlock] = useState(false)
  const [deletingBlockId, setDeletingBlockId] = useState<string | null>(null)

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
    }) =>
      addMainHomepageBlock(token!, blockType, slotCount, sectionHeading, sectionSubheading),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mainHomepageQueryKey })
      setShowAddBlock(false)
    },
  })

  const deleteBlockMutation = useMutation({
    mutationFn: ({ blockId }: { blockId: string }) =>
      deleteMainHomepageBlock(token!, blockId),
    onMutate: async ({ blockId }) => {
      setDeletingBlockId(blockId)
      await queryClient.cancelQueries({ queryKey: mainHomepageQueryKey })
      const previousHomepage =
        queryClient.getQueryData<MainHomepageResponse>(mainHomepageQueryKey)
      queryClient.setQueryData<MainHomepageResponse>(mainHomepageQueryKey, (current) =>
        deleteHomepageBlockFromCache(current, blockId),
      )
      return { previousHomepage }
    },
    onError: (_error, _variables, context) => {
      if (context?.previousHomepage) {
        queryClient.setQueryData(mainHomepageQueryKey, context.previousHomepage)
      }
    },
    onSettled: () => {
      setDeletingBlockId(null)
    },
  })

  const reorderBlocksMutation = useMutation({
    mutationFn: (orderedBlockIds: string[]) =>
      reorderMainHomepageBlocks(token!, orderedBlockIds),
    onMutate: async (orderedBlockIds) => {
      await queryClient.cancelQueries({ queryKey: mainHomepageQueryKey })
      const previousHomepage =
        queryClient.getQueryData<MainHomepageResponse>(mainHomepageQueryKey)
      queryClient.setQueryData<MainHomepageResponse>(mainHomepageQueryKey, (current) =>
        reorderHomepageBlocksInCache(current, orderedBlockIds),
      )
      return { previousHomepage }
    },
    onSuccess: (result) => {
      queryClient.setQueryData<MainHomepageResponse>(mainHomepageQueryKey, (current) =>
        reorderHomepageBlocksInCache(current, result.orderedBlockIds),
      )
    },
    onError: (_error, _variables, context) => {
      if (context?.previousHomepage) {
        queryClient.setQueryData(mainHomepageQueryKey, context.previousHomepage)
      }
    },
  })

  async function handleConvertBlock(
    block: PageBlockResponse,
    currentToken: string,
    blockType: CuratedHomepageBlockType,
    slotCount: number,
  ) {
    await queryClient.cancelQueries({ queryKey: mainHomepageQueryKey })
    const previousHomepage =
      queryClient.getQueryData<MainHomepageResponse>(mainHomepageQueryKey)
    const optimisticBlock = buildOptimisticConvertedHomepageBlock(block, blockType, slotCount)

    queryClient.setQueryData<MainHomepageResponse>(mainHomepageQueryKey, (current) =>
      replaceHomepageBlockInCache(current, optimisticBlock),
    )

    try {
      const result = await convertMainHomepageFeaturedArticlesBlock(
        currentToken,
        block.id,
        blockType,
        slotCount,
      )
      queryClient.setQueryData<MainHomepageResponse>(mainHomepageQueryKey, (current) =>
        replaceHomepageBlockInCache(current, result.block),
      )
    } catch (error) {
      if (previousHomepage) {
        queryClient.setQueryData(mainHomepageQueryKey, previousHomepage)
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
    addBlockMutation.mutate({ blockType, slotCount, sectionHeading, sectionSubheading })
  }

  const deleteError = deleteBlockMutation.isError
    ? (deleteBlockMutation.error instanceof Error ? deleteBlockMutation.error.message : 'Failed to delete block.')
    : null

  if (!canManage) {
    return (
      <div className="hf-page">
        <div className="hf-state-screen">
          <h2>Main Homepage</h2>
          <p>Only admin and editor accounts can manage the homepage.</p>
        </div>
      </div>
    )
  }

  if (homepageQuery.isLoading) {
    return (
      <div className="hf-page">
        <div className="hf-state-screen">
          <h2>Loading…</h2>
          <p>Fetching main homepage data.</p>
        </div>
      </div>
    )
  }

  if (homepageQuery.error || !homepageQuery.data) {
    return (
      <div className="hf-page">
        <div className="hf-state-screen">
          <h2>Main Homepage</h2>
          <p>
            {homepageQuery.error instanceof Error
              ? homepageQuery.error.message
              : 'Failed to load main homepage.'}
          </p>
          <Link to="/homepage-featured-content" className="hf-btn-ghost" style={{ marginTop: '1rem' }}>
            Back to hub
          </Link>
        </div>
      </div>
    )
  }

  const homepage = homepageQuery.data

  return (
    <div className="hf-page">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="hf-detail-header">
        <div className="hf-detail-header-left">
          <Link to="/homepage-featured-content" className="hf-btn-ghost">
            ← Hub
          </Link>
          <div className="hf-detail-title-block">
            <h1>Main Homepage</h1>
            <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontFamily: 'monospace' }}>
              domain.com
            </span>
          </div>
          <span className="hf-level-tag">global</span>
        </div>
        <span className="hf-enabled-tag on">Always active</span>
      </div>

      {/* ── Blocks ─────────────────────────────────────────── */}
      {homepage.pageBlocks.length === 0 ? (
        <div className="hf-state-screen">
          <h2>No blocks yet</h2>
          <p>
            The main homepage has no content blocks. Add a content block to start curating.
          </p>
        </div>
      ) : (
        <HomepageBlocksSortableList
          blocks={homepage.pageBlocks}
          disabled={
            reorderBlocksMutation.isPending
            || deleteBlockMutation.isPending
            || addBlockMutation.isPending
          }
          onReorder={(orderedIds) => reorderBlocksMutation.mutate(orderedIds)}
        >
          {(block: PageBlockResponse, idx: number) => {
            if (isArticleCuratedHomepageBlock(block)) {
              return (
                <CuratedHomepageBlockEditor
                  key={homepageBlockEditorIdentity(block).join(':')}
                  block={block}
                  blockIndex={idx}
                  token={token}
                  canManage={canManage}
                  onDeleteBlock={(blockId) => deleteBlockMutation.mutate({ blockId })}
                  isDeletingBlock={deleteBlockMutation.isPending && deletingBlockId === block.id}
                  deleteError={deleteBlockMutation.isPending || deletingBlockId !== block.id ? null : deleteError}
                  selectionQueryKey={[
                    'main-homepage-block',
                    ...homepageBlockEditorIdentity(block),
                    token,
                  ]}
                  saveSelection={async (currentToken, items) => {
                    const updated = await updateMainHomepageBlock(
                      currentToken,
                      block.id,
                      items,
                    )
                    const updatedBlock = updated.pageBlocks.find(
                      (candidate): candidate is ArticleCuratedHomepageBlockResponse =>
                        candidate.id === block.id && candidate.blockType === block.blockType,
                    )
                    if (!updatedBlock) throw new Error('Block not found after save.')
                    queryClient.invalidateQueries({ queryKey: mainHomepageQueryKey })
                    return updatedBlock.selection
                  }}
                  fetchCandidates={(currentToken, params) =>
                    block.blockType === 'questurian-maps'
                      ? fetchHomepageFeaturedCandidates(currentToken, {
                          ...params,
                          type: 'single-type-listicles',
                        })
                      : block.blockType === 'where-to-eat-drink'
                        ? fetchWhereToEatDrinkCandidates(currentToken, params)
                        : block.blockType === 'things-to-do-listicles'
                          ? fetchThingsToDoListicleCandidates(currentToken, params)
                          : fetchHomepageFeaturedCandidates(currentToken, params)}
                  saveSectionHeading={async (currentToken, value) => {
                    await updateMainHomepageFeaturedSectionHeading(currentToken, block.id, value)
                    queryClient.invalidateQueries({ queryKey: mainHomepageQueryKey })
                  }}
                  saveSectionSubheading={async (currentToken, value) => {
                    await updateMainHomepageFeaturedSectionSubheading(currentToken, block.id, value)
                    queryClient.invalidateQueries({ queryKey: mainHomepageQueryKey })
                  }}
                  saveSlot3Layout={
                    block.blockType === 'featured-articles' && block.selection.totalSlots === 3
                      ? async (currentToken, value) => {
                          await updateMainHomepageFeaturedSlot3Layout(currentToken, block.id, value)
                          queryClient.invalidateQueries({ queryKey: mainHomepageQueryKey })
                        }
                      : undefined
                  }
                  saveSlot4Layout={
                    block.blockType === 'featured-articles' && block.selection.totalSlots === 4
                      ? async (currentToken, value) => {
                          await updateMainHomepageFeaturedSlot4Layout(currentToken, block.id, value)
                          queryClient.invalidateQueries({ queryKey: mainHomepageQueryKey })
                        }
                      : undefined
                  }
                  saveSlot5Layout={
                    block.blockType === 'featured-articles' && block.selection.totalSlots === 5
                      ? async (currentToken, value) => {
                          await updateMainHomepageFeaturedSlot5Layout(currentToken, block.id, value)
                          queryClient.invalidateQueries({ queryKey: mainHomepageQueryKey })
                        }
                      : undefined
                  }
                  saveArticleGridFourLayout={
                    block.blockType === 'article-grid' && block.selection.totalSlots === 4
                      ? async (currentToken, value) => {
                          await updateMainHomepageArticleGridFourLayout(currentToken, block.id, value)
                          queryClient.invalidateQueries({ queryKey: mainHomepageQueryKey })
                        }
                      : undefined
                  }
                  convertEmptyFeaturedArticlesTargets={CONVERT_EMPTY_FEATURED_ARTICLES_TO_BLOCK_TYPES}
                  onConvertEmptyFeaturedArticlesBlock={async (currentToken, blockType, slotCount) => {
                    await handleConvertBlock(block, currentToken, blockType, slotCount)
                  }}
                />
              )
            }
            if (isLocationGridBlock(block)) {
              return (
                <LocationGridBlockEditor
                  key={homepageBlockEditorIdentity(block).join(':')}
                  block={block}
                  blockIndex={idx}
                  token={token}
                  canManage={canManage}
                  onDeleteBlock={(blockId) => deleteBlockMutation.mutate({ blockId })}
                  isDeletingBlock={deleteBlockMutation.isPending && deletingBlockId === block.id}
                  deleteError={deleteBlockMutation.isPending || deletingBlockId !== block.id ? null : deleteError}
                  childLevel="city"
                  selectionQueryKey={[
                    'main-homepage-location-grid',
                    ...homepageBlockEditorIdentity(block),
                    token,
                  ]}
                  saveSelection={async (currentToken, items) => {
                    const updated = await updateMainHomepageBlock(currentToken, block.id, items)
                    const updatedBlock = updated.pageBlocks.find(
                      (candidate): candidate is LocationGridBlockResponse =>
                        candidate.id === block.id && candidate.blockType === block.blockType,
                    )
                    if (!updatedBlock) throw new Error('Block not found after save.')
                    queryClient.invalidateQueries({ queryKey: mainHomepageQueryKey })
                    return updatedBlock.selection
                  }}
                  fetchCandidates={(currentToken, params) =>
                    fetchHomepageLocationGridCandidates(currentToken, params)}
                  saveLocationGridSectionHeading={async (currentToken, value) => {
                    await updateMainHomepageFeaturedSectionHeading(currentToken, block.id, value)
                    queryClient.invalidateQueries({ queryKey: mainHomepageQueryKey })
                  }}
                  saveLocationGridSectionSubheading={async (currentToken, value) => {
                    await updateMainHomepageFeaturedSectionSubheading(currentToken, block.id, value)
                    queryClient.invalidateQueries({ queryKey: mainHomepageQueryKey })
                  }}
                  saveLocationGridMediaAspect={async (currentToken, value) => {
                    await updateMainHomepageLocationGridMediaAspect(currentToken, block.id, value)
                    queryClient.invalidateQueries({ queryKey: mainHomepageQueryKey })
                  }}
                  convertBlockTargets={CONVERT_EMPTY_FEATURED_ARTICLES_TO_BLOCK_TYPES}
                  onConvertEmptyBlock={async (currentToken, blockType, slotCount) => {
                    await handleConvertBlock(block, currentToken, blockType, slotCount)
                  }}
                />
              )
            }
            if (isNewsletterSignupBlock(block)) {
              return (
                <NewsletterSignupBlockEditor
                  key={homepageBlockEditorIdentity(block).join(':')}
                  block={block}
                  blockIndex={idx}
                  token={token}
                  onDeleteBlock={(blockId) => deleteBlockMutation.mutate({ blockId })}
                  isDeletingBlock={deleteBlockMutation.isPending && deletingBlockId === block.id}
                  deleteError={deleteBlockMutation.isPending || deletingBlockId !== block.id ? null : deleteError}
                  saveSectionHeading={async (currentToken, value) => {
                    await updateMainHomepageFeaturedSectionHeading(currentToken, block.id, value)
                    queryClient.invalidateQueries({ queryKey: mainHomepageQueryKey })
                  }}
                  saveSectionSubheading={async (currentToken, value) => {
                    await updateMainHomepageFeaturedSectionSubheading(currentToken, block.id, value)
                    queryClient.invalidateQueries({ queryKey: mainHomepageQueryKey })
                  }}
                />
              )
            }
            if (isHotelGridBlock(block) || isTourGridBlock(block) || isThingsToDoAttractionsBlock(block)) {
              const gridBlock = block
              return (
                <HotelGridBlockEditor
                  key={homepageBlockEditorIdentity(gridBlock).join(':')}
                  block={gridBlock}
                  blockIndex={idx}
                  token={token}
                  canManage={canManage}
                  onDeleteBlock={(blockId) => deleteBlockMutation.mutate({ blockId })}
                  isDeletingBlock={deleteBlockMutation.isPending && deletingBlockId === gridBlock.id}
                  deleteError={
                    deleteBlockMutation.isPending || deletingBlockId !== gridBlock.id ? null : deleteError
                  }
                  selectionQueryKey={[
                    'main-homepage-hotel-grid',
                    ...homepageBlockEditorIdentity(gridBlock),
                    token,
                  ]}
                  saveSelection={async (currentToken, items) => {
                    const updated = await updateMainHomepageBlock(currentToken, gridBlock.id, items)
                    const updatedBlock = updated.pageBlocks.find(
                      (candidate): candidate is HotelOrAttractionGridBlockResponse =>
                        candidate.id === gridBlock.id && candidate.blockType === gridBlock.blockType,
                    )
                    if (!updatedBlock) throw new Error('Block not found after save.')
                    queryClient.invalidateQueries({ queryKey: mainHomepageQueryKey })
                    return updatedBlock.selection
                  }}
                  fetchCandidates={(currentToken, params) =>
                    gridBlock.blockType === 'things-to-do-attractions'
                      ? fetchThingsToDoAttractionCandidates(currentToken, params)
                      : gridBlock.blockType === 'tour-grid'
                        ? fetchTourGridCandidates(currentToken, params)
                        : fetchHomepageHotelGridCandidates(currentToken, params)}
                  convertBlockTargets={CONVERT_EMPTY_FEATURED_ARTICLES_TO_BLOCK_TYPES}
                  onConvertEmptyBlock={async (currentToken, blockType, slotCount) => {
                    await handleConvertBlock(gridBlock, currentToken, blockType, slotCount)
                  }}
                  saveHotelGridSectionHeading={async (currentToken, value) => {
                    await updateMainHomepageFeaturedSectionHeading(currentToken, gridBlock.id, value)
                    queryClient.invalidateQueries({ queryKey: mainHomepageQueryKey })
                  }}
                  saveHotelGridSectionSubheading={async (currentToken, value) => {
                    await updateMainHomepageFeaturedSectionSubheading(currentToken, gridBlock.id, value)
                    queryClient.invalidateQueries({ queryKey: mainHomepageQueryKey })
                  }}
                />
              )
            }
            return (
              <div key={block.id} className="hf-block-section">
                <div className="hf-block-header">
                  <div className="hf-block-label">
                    <span>Block {idx + 1}</span>
                    <span className="hf-block-type-tag">{block.blockType}</span>
                  </div>
                  <HomepageBlockDeleteTrigger
                    blockId={block.id}
                    blockIndex={idx}
                    blockLabel={block.blockType}
                    onDeleteBlock={(blockId) => deleteBlockMutation.mutate({ blockId })}
                    isDeletingBlock={deleteBlockMutation.isPending && deletingBlockId === block.id}
                    deleteError={deleteBlockMutation.isPending || deletingBlockId !== block.id ? null : deleteError}
                  />
                </div>
                <div className="hf-block-content hf-empty">
                  <p>
                    Editor for &ldquo;{block.blockType}&rdquo; blocks is not yet available in this
                    tool.
                  </p>
                </div>
              </div>
            )
          }}
        </HomepageBlocksSortableList>
      )}

      {/* ── Add block ──────────────────────────────────────── */}
      <div className="hf-add-block-row">
        {!showAddBlock ? (
          <button
            type="button"
            className="hf-btn-ghost"
            onClick={() => setShowAddBlock(true)}
          >
            + Add Block
          </button>
        ) : (
          <AddHomepageBlockPicker
            isPending={addBlockMutation.isPending}
            onConfirm={handleConfirmAddBlock}
            onCancel={() => setShowAddBlock(false)}
          />
        )}
      </div>
    </div>
  )
}

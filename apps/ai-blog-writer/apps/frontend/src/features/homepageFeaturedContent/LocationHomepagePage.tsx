import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '../../providers/useAuth'
import './homepageFeaturedContent.css'
import HomepageBlocksSortableList from './HomepageBlocksSortableList'
import AddHomepageBlockPicker from './AddHomepageBlockPicker'
import HomepageBlockDeleteTrigger from './HomepageBlockDeleteTrigger'
import CuratedHomepageBlockEditor from './CuratedHomepageBlockEditor'
import HotelGridBlockEditor from './HotelGridBlockEditor'
import LocationGridBlockEditor from './LocationGridBlockEditor'
import NewsletterSignupBlockEditor from './NewsletterSignupBlockEditor'
import {
  addLocationHomepageBlock,
  deleteLocationHomepageBlock,
  fetchLocationHomepage,
  fetchLocationHomepageCandidates,
  fetchLocationHomepageHotelGridCandidates,
  fetchLocationHomepageTourGridCandidates,
  fetchLocationHomepageLocationGridCandidates,
  fetchLocationHomepageThingsToDoAttractionCandidates,
  fetchLocationHomepageThingsToDoListicleCandidates,
  fetchLocationHomepageWhereToEatDrinkCandidates,
  reorderLocationHomepageBlocks,
  convertLocationHomepageFeaturedArticlesBlock,
  toggleLocationHomepage,
  updateLocationHomepageBlock,
  updateLocationHomepageFeaturedSectionHeading,
  updateLocationHomepageFeaturedSectionSubheading,
  updateLocationHomepageLocationGridMediaAspect,
  updateLocationHomepageFeaturedSlot3Layout,
  updateLocationHomepageFeaturedSlot4Layout,
  updateLocationHomepageFeaturedSlot5Layout,
  updateLocationHomepageArticleGridFourLayout,
  type LocationHomepageResponse,
  type LocationRef,
} from './locationHomepagesApi'
import {
  buildOptimisticConvertedHomepageBlock,
  deleteHomepageBlockFromCache,
  reorderHomepageBlocksInCache,
  replaceHomepageBlockInCache,
} from './homepageBlockOptimisticUpdates'
import {
  CONVERT_EMPTY_FEATURED_ARTICLES_TO_BLOCK_TYPES,
  HOMEPAGE_PAGE_BLOCK_TYPES,
  homepageBlockEditorIdentity,
  isHotelGridBlock,
  isTourGridBlock,
  isThingsToDoAttractionsBlock,
  isArticleCuratedHomepageBlock,
  isLocationGridBlock,
  isNewsletterSignupBlock,
  type ArticleCuratedHomepageBlockResponse,
  type CuratedHomepageBlockType,
  type HotelOrAttractionGridBlockResponse,
  type LocationGridBlockResponse,
  type PageBlockResponse,
} from './pageBlocks'
function getLocationLabel(location: LocationRef | null): string {
  if (!location) return 'Location Homepage'

  if (location.neighborhoodName) {
    return `${location.neighborhoodName}${location.cityName ? `, ${location.cityName}` : ''}`
  }

  if (location.cityName) return location.cityName

  return location.countryName ?? 'Location Homepage'
}

export default function LocationHomepagePage() {
  const { id } = useParams<{ id: string }>()
  const numericId = Number(id)
  const { token, user } = useAuth()
  const canManage = user?.role === 'admin' || user?.role === 'editor'
  const queryClient = useQueryClient()
  const homepageQueryKey = ['location-homepage', numericId, token]

  const homepageQuery = useQuery({
    queryKey: homepageQueryKey,
    queryFn: () => fetchLocationHomepage(token!, numericId),
    enabled: Boolean(token && canManage && numericId),
  })

  const [isEnabled, setIsEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    if (homepageQuery.data && isEnabled === null) {
      setIsEnabled(homepageQuery.data.isEnabled)
    }
  }, [homepageQuery.data, isEnabled])

  const toggleMutation = useMutation({
    mutationFn: () => toggleLocationHomepage(token!, numericId),
    onSuccess: (result) => {
      setIsEnabled(result.isEnabled)
      queryClient.invalidateQueries({ queryKey: ['location-homepages-list'] })
    },
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
      addLocationHomepageBlock(token!, numericId, blockType, slotCount, sectionHeading, sectionSubheading),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: homepageQueryKey })
      setShowAddBlock(false)
    },
  })

  const deleteBlockMutation = useMutation({
    mutationFn: ({ blockId }: { blockId: string }) =>
      deleteLocationHomepageBlock(token!, numericId, blockId),
    onMutate: async ({ blockId }) => {
      setDeletingBlockId(blockId)
      await queryClient.cancelQueries({ queryKey: homepageQueryKey })
      const previousHomepage =
        queryClient.getQueryData<LocationHomepageResponse>(homepageQueryKey)
      queryClient.setQueryData<LocationHomepageResponse>(homepageQueryKey, (current) =>
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
      reorderLocationHomepageBlocks(token!, numericId, orderedBlockIds),
    onMutate: async (orderedBlockIds) => {
      await queryClient.cancelQueries({ queryKey: homepageQueryKey })
      const previousHomepage =
        queryClient.getQueryData<LocationHomepageResponse>(homepageQueryKey)
      queryClient.setQueryData<LocationHomepageResponse>(homepageQueryKey, (current) =>
        reorderHomepageBlocksInCache(current, orderedBlockIds),
      )
      return { previousHomepage }
    },
    onSuccess: (result) => {
      queryClient.setQueryData<LocationHomepageResponse>(homepageQueryKey, (current) =>
        reorderHomepageBlocksInCache(current, result.orderedBlockIds),
      )
    },
    onError: (_error, _variables, context) => {
      if (context?.previousHomepage) {
        queryClient.setQueryData(homepageQueryKey, context.previousHomepage)
      }
    },
  })

  async function handleConvertBlock(
    block: PageBlockResponse,
    currentToken: string,
    blockType: CuratedHomepageBlockType,
    slotCount: number,
  ) {
    await queryClient.cancelQueries({ queryKey: homepageQueryKey })
    const previousHomepage =
      queryClient.getQueryData<LocationHomepageResponse>(homepageQueryKey)
    const optimisticBlock = buildOptimisticConvertedHomepageBlock(block, blockType, slotCount)

    queryClient.setQueryData<LocationHomepageResponse>(homepageQueryKey, (current) =>
      replaceHomepageBlockInCache(current, optimisticBlock),
    )

    try {
      const result = await convertLocationHomepageFeaturedArticlesBlock(
        currentToken,
        numericId,
        block.id,
        blockType,
        slotCount,
      )
      queryClient.setQueryData<LocationHomepageResponse>(homepageQueryKey, (current) =>
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
    addBlockMutation.mutate({ blockType, slotCount, sectionHeading, sectionSubheading })
  }

  const deleteError = deleteBlockMutation.isError
    ? (deleteBlockMutation.error instanceof Error ? deleteBlockMutation.error.message : 'Failed to delete block.')
    : null

  if (!canManage) {
    return (
      <div className="hf-page">
        <div className="hf-state-screen">
          <h2>Location Homepage</h2>
          <p>Only admin and editor accounts can manage location homepages.</p>
        </div>
      </div>
    )
  }

  if (homepageQuery.isLoading) {
    return (
      <div className="hf-page">
        <div className="hf-state-screen">
          <h2>Loading…</h2>
          <p>Fetching homepage data from Payload.</p>
        </div>
      </div>
    )
  }

  if (homepageQuery.error || !homepageQuery.data) {
    return (
      <div className="hf-page">
        <div className="hf-state-screen">
          <h2>Location Homepage</h2>
          <p>
            {homepageQuery.error instanceof Error
              ? homepageQuery.error.message
              : 'Failed to load location homepage.'}
          </p>
          <Link to="/homepage-featured-content" className="hf-btn-ghost" style={{ marginTop: '1rem' }}>
            Back to hub
          </Link>
        </div>
      </div>
    )
  }

  const homepage = homepageQuery.data
  const locationLabel = getLocationLabel(homepage.location)
  const enabledState = isEnabled ?? homepage.isEnabled
  const locationGridChildLevel = homepage.location?.level === 'city' ? 'neighborhood' : null
  const availableBlockTypes = locationGridChildLevel
    ? HOMEPAGE_PAGE_BLOCK_TYPES
    : HOMEPAGE_PAGE_BLOCK_TYPES.filter((blockType) => blockType !== 'location-grid')

  const convertEmptyFeaturedArticlesTargets = CONVERT_EMPTY_FEATURED_ARTICLES_TO_BLOCK_TYPES.filter(
    (t) => availableBlockTypes.includes(t),
  )

  return (
    <div className="hf-page">
      {/* ── Detail header ──────────────────────────────────── */}
      <div className="hf-detail-header">
        <div className="hf-detail-header-left">
          <Link to="/homepage-featured-content" className="hf-btn-ghost">
            ← Hub
          </Link>
          <div className="hf-detail-title-block">
            <h1>{locationLabel}</h1>
            {homepage.location?.locationKey && (
              <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontFamily: 'monospace' }}>
                {homepage.location.locationKey}
              </span>
            )}
          </div>
          <span className={`hf-level-tag`}>{homepage.location?.level ?? 'location'}</span>
        </div>

        <button
          type="button"
          className={`hf-toggle-btn ${enabledState ? 'on' : 'off'}`}
          onClick={() => toggleMutation.mutate()}
          disabled={toggleMutation.isPending}
        >
          {toggleMutation.isPending
            ? 'Updating…'
            : enabledState
              ? '● Enabled'
              : '○ Disabled'}
        </button>
      </div>

      {/* ── Blocks ─────────────────────────────────────────── */}
      {homepage.pageBlocks.length === 0 ? (
        <div className="hf-state-screen">
          <h2>No blocks yet</h2>
          <p>
            This homepage has no content blocks. Add a content block to start curating.
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
                    'location-homepage-block',
                    numericId,
                    ...homepageBlockEditorIdentity(block),
                    token,
                  ]}
                  saveSelection={async (currentToken, items) => {
                    const updated = await updateLocationHomepageBlock(currentToken, numericId, block.id, items)
                    const updatedBlock = updated.pageBlocks.find(
                      (candidate): candidate is ArticleCuratedHomepageBlockResponse =>
                        candidate.id === block.id && candidate.blockType === block.blockType,
                    )
                    if (!updatedBlock) throw new Error('Block not found after save.')
                    queryClient.invalidateQueries({ queryKey: homepageQueryKey })
                    return updatedBlock.selection
                  }}
                  fetchCandidates={(currentToken, params) =>
                    block.blockType === 'questurian-maps'
                      ? fetchLocationHomepageCandidates(currentToken, numericId, {
                          ...params,
                          type: 'single-type-listicles',
                        })
                      : block.blockType === 'where-to-eat-drink'
                        ? fetchLocationHomepageWhereToEatDrinkCandidates(currentToken, numericId, params)
                        : block.blockType === 'things-to-do-listicles'
                          ? fetchLocationHomepageThingsToDoListicleCandidates(currentToken, numericId, params)
                          : fetchLocationHomepageCandidates(
                            currentToken,
                            numericId,
                            params as Parameters<typeof fetchLocationHomepageCandidates>[2],
                          )}
                  saveSectionHeading={async (currentToken, value) => {
                    await updateLocationHomepageFeaturedSectionHeading(currentToken, numericId, block.id, value)
                    queryClient.invalidateQueries({ queryKey: homepageQueryKey })
                  }}
                  saveSectionSubheading={async (currentToken, value) => {
                    await updateLocationHomepageFeaturedSectionSubheading(currentToken, numericId, block.id, value)
                    queryClient.invalidateQueries({ queryKey: homepageQueryKey })
                  }}
                  saveSlot3Layout={
                    block.blockType === 'featured-articles' && block.selection.totalSlots === 3
                      ? async (currentToken, value) => {
                          await updateLocationHomepageFeaturedSlot3Layout(currentToken, numericId, block.id, value)
                          queryClient.invalidateQueries({ queryKey: homepageQueryKey })
                        }
                      : undefined
                  }
                  saveSlot4Layout={
                    block.blockType === 'featured-articles' && block.selection.totalSlots === 4
                      ? async (currentToken, value) => {
                          await updateLocationHomepageFeaturedSlot4Layout(currentToken, numericId, block.id, value)
                          queryClient.invalidateQueries({ queryKey: homepageQueryKey })
                        }
                      : undefined
                  }
                  saveSlot5Layout={
                    block.blockType === 'featured-articles' && block.selection.totalSlots === 5
                      ? async (currentToken, value) => {
                          await updateLocationHomepageFeaturedSlot5Layout(currentToken, numericId, block.id, value)
                          queryClient.invalidateQueries({ queryKey: homepageQueryKey })
                        }
                      : undefined
                  }
                  saveArticleGridFourLayout={
                    block.blockType === 'article-grid' && block.selection.totalSlots === 4
                      ? async (currentToken, value) => {
                          await updateLocationHomepageArticleGridFourLayout(currentToken, numericId, block.id, value)
                          queryClient.invalidateQueries({ queryKey: homepageQueryKey })
                        }
                      : undefined
                  }
                  convertEmptyFeaturedArticlesTargets={convertEmptyFeaturedArticlesTargets}
                  onConvertEmptyFeaturedArticlesBlock={async (currentToken, blockType, slotCount) => {
                    await handleConvertBlock(block, currentToken, blockType, slotCount)
                  }}
                />
              )
            }
            if (isLocationGridBlock(block) && locationGridChildLevel) {
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
                  childLevel={locationGridChildLevel}
                  selectionQueryKey={[
                    'location-homepage-location-grid',
                    numericId,
                    ...homepageBlockEditorIdentity(block),
                    token,
                  ]}
                  saveSelection={async (currentToken, items) => {
                    const updated = await updateLocationHomepageBlock(currentToken, numericId, block.id, items)
                    const updatedBlock = updated.pageBlocks.find(
                      (candidate): candidate is LocationGridBlockResponse =>
                        candidate.id === block.id && candidate.blockType === block.blockType,
                    )
                    if (!updatedBlock) throw new Error('Block not found after save.')
                    queryClient.invalidateQueries({ queryKey: homepageQueryKey })
                    return updatedBlock.selection
                  }}
                  fetchCandidates={(currentToken, params) =>
                    fetchLocationHomepageLocationGridCandidates(currentToken, numericId, params)}
                  saveLocationGridSectionHeading={async (currentToken, value) => {
                    await updateLocationHomepageFeaturedSectionHeading(currentToken, numericId, block.id, value)
                    queryClient.invalidateQueries({ queryKey: homepageQueryKey })
                  }}
                  saveLocationGridSectionSubheading={async (currentToken, value) => {
                    await updateLocationHomepageFeaturedSectionSubheading(currentToken, numericId, block.id, value)
                    queryClient.invalidateQueries({ queryKey: homepageQueryKey })
                  }}
                  saveLocationGridMediaAspect={async (currentToken, value) => {
                    await updateLocationHomepageLocationGridMediaAspect(currentToken, numericId, block.id, value)
                    queryClient.invalidateQueries({ queryKey: homepageQueryKey })
                  }}
                  convertBlockTargets={convertEmptyFeaturedArticlesTargets}
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
                    await updateLocationHomepageFeaturedSectionHeading(currentToken, numericId, block.id, value)
                    queryClient.invalidateQueries({ queryKey: homepageQueryKey })
                  }}
                  saveSectionSubheading={async (currentToken, value) => {
                    await updateLocationHomepageFeaturedSectionSubheading(currentToken, numericId, block.id, value)
                    queryClient.invalidateQueries({ queryKey: homepageQueryKey })
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
                    'location-homepage-hotel-grid',
                    numericId,
                    ...homepageBlockEditorIdentity(gridBlock),
                    token,
                  ]}
                  saveSelection={async (currentToken, items) => {
                    const updated = await updateLocationHomepageBlock(currentToken, numericId, gridBlock.id, items)
                    const updatedBlock = updated.pageBlocks.find(
                      (candidate): candidate is HotelOrAttractionGridBlockResponse =>
                        candidate.id === gridBlock.id && candidate.blockType === gridBlock.blockType,
                    )
                    if (!updatedBlock) throw new Error('Block not found after save.')
                    queryClient.invalidateQueries({ queryKey: homepageQueryKey })
                    return updatedBlock.selection
                  }}
                  fetchCandidates={(currentToken, params) =>
                    gridBlock.blockType === 'things-to-do-attractions'
                      ? fetchLocationHomepageThingsToDoAttractionCandidates(
                        currentToken,
                        numericId,
                        params,
                      )
                      : gridBlock.blockType === 'tour-grid'
                        ? fetchLocationHomepageTourGridCandidates(currentToken, numericId, params)
                        : fetchLocationHomepageHotelGridCandidates(currentToken, numericId, params)}
                  convertBlockTargets={convertEmptyFeaturedArticlesTargets}
                  onConvertEmptyBlock={async (currentToken, blockType, slotCount) => {
                    await handleConvertBlock(gridBlock, currentToken, blockType, slotCount)
                  }}
                  saveHotelGridSectionHeading={async (currentToken, value) => {
                    await updateLocationHomepageFeaturedSectionHeading(currentToken, numericId, gridBlock.id, value)
                    queryClient.invalidateQueries({ queryKey: homepageQueryKey })
                  }}
                  saveHotelGridSectionSubheading={async (currentToken, value) => {
                    await updateLocationHomepageFeaturedSectionSubheading(currentToken, numericId, gridBlock.id, value)
                    queryClient.invalidateQueries({ queryKey: homepageQueryKey })
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
                  <p>Editor for &ldquo;{block.blockType}&rdquo; blocks is not yet available in this tool.</p>
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
            availableBlockTypes={availableBlockTypes}
          />
        )}
      </div>
    </div>
  )
}

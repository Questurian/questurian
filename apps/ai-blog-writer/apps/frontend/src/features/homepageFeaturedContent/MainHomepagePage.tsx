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
  fetchThingsToDoAttractionCandidates,
  fetchThingsToDoListicleCandidates,
  fetchWhereToEatDrinkCandidates,
  convertMainHomepageFeaturedArticlesBlock,
  fetchMainHomepage,
  reorderMainHomepageBlocks,
  updateMainHomepageBlock,
  updateMainHomepageFeaturedSectionHeading,
} from './api'
import HomepageBlocksSortableList from './HomepageBlocksSortableList'
import AddHomepageBlockPicker from './AddHomepageBlockPicker'
import HomepageBlockDeleteTrigger from './HomepageBlockDeleteTrigger'
import CuratedHomepageBlockEditor from './CuratedHomepageBlockEditor'
import HotelGridBlockEditor from './HotelGridBlockEditor'
import LocationGridBlockEditor from './LocationGridBlockEditor'
import {
  isHotelGridBlock,
  isThingsToDoAttractionsBlock,
  isArticleCuratedHomepageBlock,
  CONVERT_EMPTY_FEATURED_ARTICLES_TO_BLOCK_TYPES,
  isLocationGridBlock,
  type ArticleCuratedHomepageBlockResponse,
  type CuratedHomepageBlockType,
  type HotelOrAttractionGridBlockResponse,
  type LocationGridBlockResponse,
  type PageBlockResponse,
} from './pageBlocks'
import { HOMEPAGE_EDITOR_MODES, type HomepageEditorMode } from './types'

function homepageModeLabel(mode: HomepageEditorMode): string {
  if (mode === 'explore') return 'Explore'
  if (mode === 'stay') return 'Stay'
  return 'Move'
}

export default function MainHomepagePage() {
  const { token, user } = useAuth()
  const canManage = user?.role === 'admin' || user?.role === 'editor'
  const queryClient = useQueryClient()
  const [homepageMode, setHomepageMode] = useState<HomepageEditorMode>('explore')
  const mainHomepageQueryKey = ['main-homepage', homepageMode, token]

  const homepageQuery = useQuery({
    queryKey: mainHomepageQueryKey,
    queryFn: () => fetchMainHomepage(token!, homepageMode),
    enabled: Boolean(token && canManage),
  })

  const [showAddBlock, setShowAddBlock] = useState(false)
  const [deletingBlockId, setDeletingBlockId] = useState<string | null>(null)

  const addBlockMutation = useMutation({
    mutationFn: ({
      blockType,
      slotCount,
      sectionHeading,
    }: {
      blockType: CuratedHomepageBlockType
      slotCount: number
      sectionHeading?: string | null
    }) => addMainHomepageBlock(token!, blockType, slotCount, homepageMode, sectionHeading),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mainHomepageQueryKey })
      setShowAddBlock(false)
    },
  })

  const deleteBlockMutation = useMutation({
    mutationFn: ({ blockId }: { blockId: string }) =>
      deleteMainHomepageBlock(token!, blockId, homepageMode),
    onMutate: ({ blockId }) => {
      setDeletingBlockId(blockId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mainHomepageQueryKey })
    },
    onSettled: () => {
      setDeletingBlockId(null)
    },
  })

  const reorderBlocksMutation = useMutation({
    mutationFn: (orderedBlockIds: string[]) =>
      reorderMainHomepageBlocks(token!, orderedBlockIds, homepageMode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mainHomepageQueryKey })
    },
  })

  function handleConfirmAddBlock(
    blockType: CuratedHomepageBlockType,
    slotCount: number,
    sectionHeading?: string | null,
  ) {
    addBlockMutation.mutate({ blockType, slotCount, sectionHeading })
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

      <div className="hf-mode-switch" aria-label="Homepage variant">
        <span className="hf-mode-switch-label">Variant</span>
        <div className="hf-mode-segment" role="tablist">
          {HOMEPAGE_EDITOR_MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={homepageMode === m}
              className={homepageMode === m ? 'hf-mode-active' : undefined}
              onClick={() => setHomepageMode(m)}
            >
              {homepageModeLabel(m)}
            </button>
          ))}
        </div>
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
                  key={block.id}
                  block={block}
                  blockIndex={idx}
                  token={token}
                  canManage={canManage}
                  onDeleteBlock={(blockId) => deleteBlockMutation.mutate({ blockId })}
                  isDeletingBlock={deleteBlockMutation.isPending && deletingBlockId === block.id}
                  deleteError={deleteBlockMutation.isPending || deletingBlockId !== block.id ? null : deleteError}
                  selectionQueryKey={['main-homepage-block', homepageMode, block.id, token]}
                  saveSelection={async (currentToken, items) => {
                    const updated = await updateMainHomepageBlock(
                      currentToken,
                      block.id,
                      items,
                      homepageMode,
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
                    await updateMainHomepageFeaturedSectionHeading(
                      currentToken,
                      block.id,
                      value,
                      homepageMode,
                    )
                    queryClient.invalidateQueries({ queryKey: mainHomepageQueryKey })
                  }}
                  convertEmptyFeaturedArticlesTargets={CONVERT_EMPTY_FEATURED_ARTICLES_TO_BLOCK_TYPES}
                  onConvertEmptyFeaturedArticlesBlock={async (currentToken, blockType, slotCount) => {
                    await convertMainHomepageFeaturedArticlesBlock(
                      currentToken,
                      block.id,
                      blockType,
                      slotCount,
                      homepageMode,
                    )
                    queryClient.invalidateQueries({ queryKey: mainHomepageQueryKey })
                  }}
                />
              )
            }
            if (isLocationGridBlock(block)) {
              return (
                <LocationGridBlockEditor
                  key={block.id}
                  block={block}
                  blockIndex={idx}
                  token={token}
                  canManage={canManage}
                  onDeleteBlock={(blockId) => deleteBlockMutation.mutate({ blockId })}
                  isDeletingBlock={deleteBlockMutation.isPending && deletingBlockId === block.id}
                  deleteError={deleteBlockMutation.isPending || deletingBlockId !== block.id ? null : deleteError}
                  childLevel="city"
                  selectionQueryKey={['main-homepage-location-grid', homepageMode, block.id, token]}
                  saveSelection={async (currentToken, items) => {
                    const updated = await updateMainHomepageBlock(
                      currentToken,
                      block.id,
                      items,
                      homepageMode,
                    )
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
                    await updateMainHomepageFeaturedSectionHeading(
                      currentToken,
                      block.id,
                      value,
                      homepageMode,
                    )
                    queryClient.invalidateQueries({ queryKey: mainHomepageQueryKey })
                  }}
                />
              )
            }
            if (isHotelGridBlock(block) || isThingsToDoAttractionsBlock(block)) {
              const gridBlock = block
              return (
                <HotelGridBlockEditor
                  key={gridBlock.id}
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
                    homepageMode,
                    gridBlock.blockType,
                    gridBlock.id,
                    token,
                  ]}
                  saveSelection={async (currentToken, items) => {
                    const updated = await updateMainHomepageBlock(
                      currentToken,
                      gridBlock.id,
                      items,
                      homepageMode,
                    )
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
                      : fetchHomepageHotelGridCandidates(currentToken, params)}
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
